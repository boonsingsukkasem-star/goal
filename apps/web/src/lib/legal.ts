const appEnvironment = process.env.NEXT_PUBLIC_APP_ENV ?? "nonprod";

const configuredLegalIdentity = {
  address: process.env.LEGAL_ENTITY_ADDRESS?.trim(),
  effectiveDate: process.env.LEGAL_PRIVACY_EFFECTIVE_DATE?.trim(),
  entityName: process.env.LEGAL_ENTITY_NAME?.trim(),
  registrationNumber: process.env.LEGAL_ENTITY_REGISTRATION_NUMBER?.trim(),
  reviewDate: process.env.LEGAL_PRIVACY_REVIEW_DATE?.trim(),
};

if (appEnvironment === "prod") {
  const missing = [
    ["LEGAL_ENTITY_NAME", configuredLegalIdentity.entityName],
    ["LEGAL_ENTITY_ADDRESS", configuredLegalIdentity.address],
    ["LEGAL_PRIVACY_EFFECTIVE_DATE", configuredLegalIdentity.effectiveDate],
    ["LEGAL_PRIVACY_REVIEW_DATE", configuredLegalIdentity.reviewDate],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Production legal identity is incomplete. Configure: ${missing.join(", ")}`);
  }

  for (const [key, value] of [
    ["LEGAL_PRIVACY_EFFECTIVE_DATE", configuredLegalIdentity.effectiveDate],
    ["LEGAL_PRIVACY_REVIEW_DATE", configuredLegalIdentity.reviewDate],
  ] as const) {
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error(`${key} must use ISO date format YYYY-MM-DD`);
    }
  }
}

export const legalIdentity = {
  address: configuredLegalIdentity.address ?? "รอยืนยันที่อยู่จดทะเบียนของผู้ให้บริการ",
  effectiveDate: configuredLegalIdentity.effectiveDate ?? "รอการอนุมัติก่อนเผยแพร่ production",
  entityName: configuredLegalIdentity.entityName ?? "Goal (รอยืนยันชื่อนิติบุคคลตามทะเบียน)",
  isReviewed: Boolean(configuredLegalIdentity.reviewDate),
  privacyEmail: "privacy@goal.co.th",
  registrationNumber: configuredLegalIdentity.registrationNumber,
  reviewDate: configuredLegalIdentity.reviewDate ?? "รอการตรวจจากที่ปรึกษากฎหมาย",
  supportEmail: "support@goal.co.th",
} as const;

export const privacyPolicyVersion = "2026-08-17";
