import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface PinPayload {
  image_base64: string;
}

function toImageSrc(imageBase64: string): string {
  return imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/png;base64,${imageBase64}`;
}

export function PinApp() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<PinPayload>("init_pin_window")
      .then((payload) => setImageSrc(toImageSrc(payload.image_base64)))
      .catch((err) => setError(String(err)));
  }, []);

  const close = () => {
    getCurrentWindow().close().catch(() => undefined);
  };

  return (
    <main className="pin-shell">
      <header className="pin-titlebar" data-tauri-drag-region>
        <span data-tauri-drag-region>Pin</span>
        <button type="button" className="pin-close" onClick={close} aria-label="Close pinned image">
          x
        </button>
      </header>
      {error ? <p className="pin-error">{error}</p> : null}
      {imageSrc ? <img className="pin-image" src={imageSrc} alt="Pinned screenshot" draggable={false} /> : null}
    </main>
  );
}

export default PinApp;
