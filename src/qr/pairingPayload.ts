export interface PhoneCallPairPayload {
  type: "PHONE_CALL_PAIR";
  version: 1;
  host: string;
  port: number;
  pairingId: string;
  pairingToken: string;
}

export function buildPairingPayload(
  pairingId: string,
  pairingToken: string,
  host: string,
  port: number,
): PhoneCallPairPayload {
  return {
    type: "PHONE_CALL_PAIR",
    version: 1,
    host,
    port,
    pairingId,
    pairingToken,
  };
}

export function pairingPayloadToJson(payload: PhoneCallPairPayload): string {
  return JSON.stringify(payload);
}
