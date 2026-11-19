Synthetic 128 x 128 RGB JPEG, generated locally for strict progressive decode regression. No user media or metadata.

Generator: P6 PPM, pixel (x,y) = ((13*x+27*y)%256, (17*x+3*y)%256, (7*x+19*y)%256); libjpeg-turbo cjpeg -quality 90 -progressive.

The two restart fixtures add `-restart 1B` to the same baseline and progressive encoder commands, covering real restart markers and bitstream resets.

`baseline-128.jpg` uses the same generator and `cjpeg -quality 90`. `multiscan-baseline-128.jpg` adds `-sample 1x1 -scans` with the synthetic scan script `0; 1; 2;`, providing complete sequential component scans.

`unsupported-subsampled-multiscan-128.jpg` uses the same component scan script with cjpeg default 4:2:0 sampling. It is valid JPEG but the pinned backend produces incorrect pixels for that geometry; strict host validation explicitly rejects it. This is a decoder support boundary, distinct from malformed/truncated input.

`restart-multiscan-baseline-128.jpg` adds `-restart 1B` to the supported sequential444 command, covering completion across real restart boundaries in component scans.
