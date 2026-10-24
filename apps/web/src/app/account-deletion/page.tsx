import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, LegalSection } from "@/components/site/legal-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { legalIdentity } from "@/lib/legal";

export const metadata: Metadata = {
  alternates: { canonical: "/account-deletion" },
  description: "ช่องทางลบบัญชี Goal และข้อมูลที่เชื่อมโยงกับบัญชีจากในแอปหรือจากภายนอกแอป",
  title: "ลบบัญชี",
};

const deletionRequestHref = `mailto:${legalIdentity.privacyEmail}?subject=${encodeURIComponent(
  "คำขอลบบัญชี Goal",
)}&body=${encodeURIComponent(
  "ฉันต้องการลบบัญชี Goal ที่ใช้อีเมลนี้ กรุณาแจ้งขั้นตอนยืนยันตัวตนและเลขอ้างอิงคำขอ\n\nห้ามส่งรหัสผ่านหรือ OTP มากับอีเมลนี้",
)}`;

export default function AccountDeletionPage() {
  return (
    <LegalPage
      description="ผู้ใช้ Goal สามารถลบบัญชีและข้อมูลที่เชื่อมโยงได้จากในแอป หรือส่งคำขอผ่านเว็บนี้แม้ลบแอปออกจากอุปกรณ์แล้ว"
      eyebrow="Account and data deletion"
      title="ลบบัญชี Goal"
    >
      <section className="grid gap-4 sm:grid-cols-2">
        <Card className="rounded-[2rem] border-primary/40 bg-primary/5">
          <CardContent className="p-6 sm:p-8">
            <p className="font-label text-sm tracking-[0.15em] text-primary uppercase">
              เร็วที่สุด
            </p>
            <h2 className="mt-2 font-headline-thai text-3xl font-bold">ลบจากบัญชีที่ล็อกอิน</h2>
            <p className="mt-3 font-body-thai leading-7 text-muted-foreground">
              Web: เข้า Account → พิมพ์ DELETE → ลบบัญชีถาวร
              <br />
              iOS/Android: เข้า Account → Delete account → ยืนยัน
            </p>
            <Button asChild className="mt-5">
              <Link href="/account">ไปหน้า Account</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-accent/40 bg-accent/5">
          <CardContent className="p-6 sm:p-8">
            <p className="font-label text-sm tracking-[0.15em] text-accent uppercase">
              ไม่มีแอปหรือเข้าไม่ได้
            </p>
            <h2 className="mt-2 font-headline-thai text-3xl font-bold">ส่งคำขอจากภายนอก</h2>
            <p className="mt-3 font-body-thai leading-7 text-muted-foreground">
              ส่งจากอีเมลของบัญชี Goal ไปที่ {legalIdentity.privacyEmail} หากใช้ Hide My Email ของ
              Apple ให้ส่งจาก private relay address ที่ผูกกับบัญชีเมื่อทำได้
            </p>
            <Button asChild className="mt-5 bg-accent text-accent-foreground hover:bg-accent/85">
              <a href={deletionRequestHref}>ส่งคำขอลบบัญชี</a>
            </Button>
          </CardContent>
        </Card>
      </section>

      <LegalSection title="การยืนยันตัวตนและความปลอดภัย">
        <ol className="list-decimal space-y-2 pl-6">
          <li>ส่งคำขอจากอีเมลที่ใช้กับบัญชีและระบุว่าต้องการลบบัญชี Goal</li>
          <li>เราจะตอบพร้อมเลขอ้างอิงและอาจขอข้อมูลเท่าที่จำเป็นเพื่อยืนยันว่าเป็นเจ้าของบัญชี</li>
          <li>เมื่อยืนยันแล้ว ระบบจะเพิกถอน session ปิด notification และเริ่มลบข้อมูล</li>
          <li>เราจะส่งผลการดำเนินการกลับทางอีเมลเมื่อการลบในระบบหลักเสร็จสิ้น</li>
        </ol>
        <p className="font-semibold text-foreground">
          ห้ามส่งรหัสผ่าน OTP, recovery code หรือ access token ให้ Goal ไม่ว่ากรณีใด
        </p>
      </LegalSection>

      <LegalSection title="ข้อมูลที่จะถูกลบ">
        <ul className="list-disc space-y-2 pl-6">
          <li>บัญชี โปรไฟล์ และการเชื่อม Google, Facebook หรือ Apple</li>
          <li>รายการโปรด การติดตามการแข่งขัน preference และ personalization ที่ผูกกับบัญชี</li>
          <li>Push token, notification settings และ notification history ที่ผูกกับบัญชี</li>
          <li>AI comparisons/requests และ news engagement ที่ระบุกลับมายังบัญชีได้</li>
        </ul>
        <p>
          การลบเป็นการลบบัญชีถาวร ไม่ใช่การพักบัญชี
          และไม่สามารถย้อนคืนรายการโปรดหรือประวัติส่วนบุคคลได้
        </p>
      </LegalSection>

      <LegalSection title="ระยะเวลาดำเนินการและข้อมูลที่อาจต้องเก็บ">
        <ul className="list-disc space-y-2 pl-6">
          <li>เพิกถอน session และปิด notification ทันทีเมื่อคำขอได้รับการยืนยัน</li>
          <li>ลบหรือทำให้ข้อมูลในระบบหลักไม่สามารถระบุตัวบุคคลได้ภายใน 7 วันปฏิทิน</li>
          <li>Push token ที่ปิดใช้งานและสำเนาสำรองเข้ารหัสหมดอายุตามรอบภายใน 30 วัน</li>
          <li>
            หลักฐานคำขอแบบ pseudonymized อาจเก็บ 180 วันเพื่อความปลอดภัยและพิสูจน์การดำเนินการ
          </li>
        </ul>
        <p>
          ข้อมูลบางส่วนอาจเก็บต่อเท่าที่กฎหมาย ความปลอดภัย การป้องกันทุจริต หรือข้อพิพาทกำหนด
          โดยจะไม่ใช้ต่อเพื่อ personalization หรือ marketing
        </p>
      </LegalSection>

      <LegalSection title="ต้องการความช่วยเหลือ">
        <p>
          ติดต่อ{" "}
          <a className="font-semibold text-primary hover:underline" href={deletionRequestHref}>
            {legalIdentity.privacyEmail}
          </a>{" "}
          หรือดูช่องทางอื่นที่{" "}
          <Link className="font-semibold text-primary hover:underline" href="/support">
            Goal Support
          </Link>
        </p>
        <p>
          รายละเอียดทั้งหมดเกี่ยวกับ retention และสิทธิอยู่ใน{" "}
          <Link className="font-semibold text-primary hover:underline" href="/privacy#retention">
            นโยบายความเป็นส่วนตัว
          </Link>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
