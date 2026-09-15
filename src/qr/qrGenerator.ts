import QRCode from "qrcode";
import { buildPairingPayload, pairingPayloadToJson } from "./pairingPayload";

const QR_OPTIONS = {
  errorCorrectionLevel: "M" as const,
  type: "image/png" as const,
  margin: 2,
  width: 320,
  color: {
    dark: "#000000",
    light: "#FFFFFF",
  },
};

export async function generatePairingQrDataUrl(
  pairingId: string,
  pairingToken: string,
  endpoint: { host: string; port: number },
): Promise<string> {
  const payload = buildPairingPayload(pairingId, pairingToken, endpoint.host, endpoint.port);
  return QRCode.toDataURL(pairingPayloadToJson(payload), QR_OPTIONS);
}
