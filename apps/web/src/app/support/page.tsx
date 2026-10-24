import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, LegalSection } from "@/components/site/legal-page";
import { SupportContactCard } from "@/components/site/support-contact-card";
import { legalIdentity } from "@/lib/legal";

export const metadata: Metadata = {
  alternates: { canonical: "/support" },
  description: "ช่องทางช่วยเหลือด้านบัญชี การใช้งาน ความเป็นส่วนตัว และข้อมูลฟุตบอลของ Goal",
  title: "ช่วยเหลือ",
};

export default function SupportPage() {
  return (
    <LegalPage
      description="เลือกช่องทางตามเรื่องที่ต้องการ ทีมงานจะใช้ข้อมูลเท่าที่จำเป็นในการตรวจสอบและจะไม่ขอรหัสผ่าน private key หรือ access token"
      eyebrow="Goal support"
      title="เราช่วยอะไรได้บ้าง"
    >
      <section className="grid gap-4 sm:grid-cols-2">
        <SupportContactCard
          email={legalIdentity.supportEmail}
          eyebrow="Product support"
          href={`mailto:${legalIdentity.supportEmail}?subject=${encodeURIComponent("ขอความช่วยเหลือเกี่ยวกับ Goal")}`}
          title="บัญชีและการใช้งาน"
        />
        <SupportContactCard
          email={legalIdentity.privacyEmail}
          eyebrow="Privacy support"
          href={`mailto:${legalIdentity.privacyEmail}?subject=${encodeURIComponent("คำขอด้านข้อมูลส่วนบุคคลของ Goal")}`}
          title="ข้อมูลส่วนบุคคล"
          tone="accent"
        />
      </section>

      <LegalSection title="ข้อมูลที่ช่วยให้ตรวจสอบได้เร็วขึ้น">
        <ul className="list-disc space-y-2 pl-6">
          <li>อีเมลของบัญชี Goal หากเป็นเรื่องบัญชี โดยส่งจากอีเมลเดียวกันเมื่อทำได้</li>
          <li>ระบบปฏิบัติการ รุ่นอุปกรณ์ เวอร์ชันแอป และเวลาที่พบปัญหาพร้อมเขตเวลา</li>
          <li>Match, Team, Player หรือ News URL/ID ที่เกี่ยวข้อง โดยไม่ส่ง provider API token</li>
          <li>ภาพหน้าจอที่ปิดบังอีเมล push token และข้อมูลส่วนบุคคลของบุคคลอื่นแล้ว</li>
        </ul>
        <p className="font-semibold text-foreground">
          Goal จะไม่ขอรหัสผ่าน, one-time password, Apple private key, Supabase key หรือ access token
        </p>
      </LegalSection>

      <LegalSection title="คำขอบัญชีและความเป็นส่วนตัว">
        <p>
          ลบบัญชีได้ทันทีจากหน้า Account ใน Web/iOS/Android หรือส่งคำขอจากภายนอกแอปผ่าน{" "}
          <Link className="font-semibold text-primary hover:underline" href="/account-deletion">
            หน้าลบบัญชี
          </Link>
        </p>
        <p>
          อ่านรายละเอียดประเภทข้อมูล วัตถุประสงค์ ระยะเวลาเก็บ และสิทธิได้ใน{" "}
          <Link className="font-semibold text-primary hover:underline" href="/privacy">
            นโยบายความเป็นส่วนตัว
          </Link>
        </p>
      </LegalSection>

      <LegalSection title="ข่าวและข้อมูลฟุตบอล">
        <p>
          หากพบสกอร์ รายชื่อนักเตะ ข่าว หรือลิงก์อ้างอิงไม่ถูกต้อง ให้ส่ง URL
          ของหน้าและเวลาที่พบมาที่ฝ่ายช่วยเหลือ
          กรุณาอย่าส่งบทความเต็มหรือเนื้อหาที่ไม่มีสิทธิ์เผยแพร่
        </p>
      </LegalSection>
    </LegalPage>
  );
}
