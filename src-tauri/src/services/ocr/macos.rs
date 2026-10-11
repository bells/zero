use super::{OcrError, OcrLine, OcrPageResult, OcrRect};
use objc2::{rc::autoreleasepool, AnyThread};
use objc2_foundation::{NSArray, NSData, NSDictionary, NSString};
use objc2_vision::{
    VNImageRequestHandler, VNRecognizeTextRequest, VNRequest, VNRequestTextRecognitionLevel,
};

pub fn languages() -> Result<Vec<String>, OcrError> {
    // Vision exists on 10.13, but text recognition was added in 10.15.
    if objc2::runtime::AnyClass::get(c"VNRecognizeTextRequest").is_none() {
        return Err(OcrError::ProviderUnavailable);
    }
    autoreleasepool(|_| {
        let request = VNRecognizeTextRequest::new();
        request.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
        unsafe { request.supportedRecognitionLanguagesAndReturnError() }
            .map(|values| values.iter().map(|v| v.to_string()).collect())
            .map_err(|_| OcrError::ProviderUnavailable)
    })
}
pub fn recognize(
    bytes: &[u8],
    requested: &[String],
    (width, height): (u32, u32),
) -> Result<OcrPageResult, OcrError> {
    autoreleasepool(|_| {
        let supported = languages()?;
        if requested.len() > 8 || requested.iter().any(|l| !supported.contains(l)) {
            return Err(OcrError::LanguageUnavailable);
        }
        let languages: Vec<_> = if requested.is_empty() {
            ["zh-Hans", "en-US"]
                .iter()
                .filter(|l| supported.iter().any(|s| s == **l))
                .map(|l| NSString::from_str(l))
                .collect()
        } else {
            requested.iter().map(|l| NSString::from_str(l)).collect()
        };
        let request = VNRecognizeTextRequest::new();
        request.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
        request.setUsesLanguageCorrection(true);
        if !languages.is_empty() {
            request.setRecognitionLanguages(&NSArray::from_retained_slice(&languages));
        }
        let handler = VNImageRequestHandler::initWithData_options(
            VNImageRequestHandler::alloc(),
            &NSData::with_bytes(bytes),
            &NSDictionary::new(),
        );
        let requests = NSArray::<VNRequest>::from_slice(&[&request]);
        handler
            .performRequests_error(&requests)
            .map_err(|_| OcrError::RecognitionFailed)?;
        let mut lines = Vec::new();
        if let Some(observations) = request.results() {
            if observations.len() > 10_000 {
                return Err(OcrError::ResourceLimit);
            }
            for observation in observations.iter() {
                if let Some(text) = observation.topCandidates(1).firstObject() {
                    let rect = unsafe { observation.boundingBox() };
                    lines.push(OcrLine {
                        text: text.string().to_string(),
                        confidence: f64::from(text.confidence()),
                        bounds: OcrRect {
                            x: rect.origin.x * f64::from(width),
                            y: (1.0 - rect.origin.y - rect.size.height) * f64::from(height),
                            width: rect.size.width * f64::from(width),
                            height: rect.size.height * f64::from(height),
                        },
                    });
                }
            }
        }
        lines.sort_by(|a, b| {
            a.bounds
                .y
                .total_cmp(&b.bounds.y)
                .then(a.bounds.x.total_cmp(&b.bounds.x))
        });
        let warnings = if lines.iter().any(|l| l.confidence < 0.6) {
            vec!["lowConfidence".into()]
        } else {
            vec![]
        };
        Ok(OcrPageResult {
            width,
            height,
            lines,
            warnings,
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn vision_recognizes_synthetic_bilingual_edges_and_blank() {
        let languages = languages().expect("Vision language probe");
        assert!(languages.iter().any(|language| language == "en-US"));
        assert!(languages.iter().any(|language| language == "zh-Hans"));
        let bytes = include_bytes!("../../../../tests/fixtures/ocr/bilingual.png");
        let result = recognize(bytes, &[], (1400, 1800)).expect("real Vision recognition");
        super::super::validate_result(&result).unwrap();
        let text = result
            .lines
            .iter()
            .map(|line| line.text.as_str())
            .collect::<Vec<_>>()
            .join("\n");
        assert!(
            text.contains("Zero OCR synthetic page"),
            "English heading absent"
        );
        assert!(text.contains("中文测试内容"), "Chinese text absent");
        let top = result
            .lines
            .iter()
            .find(|line| line.text.contains("Zero OCR"))
            .unwrap();
        let bottom = result
            .lines
            .iter()
            .find(|line| line.text.contains("Bottom edge"))
            .unwrap();
        assert!(top.bounds.y < 120.0);
        assert!(bottom.bounds.y > 1600.0);
        assert!(recognize(
            include_bytes!("../../../../tests/fixtures/ocr/blank.png"),
            &[],
            (1400, 1800)
        )
        .unwrap()
        .lines
        .is_empty());
        assert!(matches!(
            recognize(bytes, &["unsupported-language".into()], (1400, 1800)),
            Err(OcrError::LanguageUnavailable)
        ));
    }
}
