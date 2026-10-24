import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, LegalSection } from "@/components/site/legal-page";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { legalIdentity, privacyPolicyVersion } from "@/lib/legal";

export const metadata: Metadata = {
  alternates: { canonical: "/privacy" },
  description: "นโยบายความเป็นส่วนตัวของ Goal และรายละเอียดการใช้ เก็บรักษา และลบข้อมูล",
  title: "นโยบายความเป็นส่วนตัว",
};

const processors = [
  ["Supabase", "ฐานข้อมูล การยืนยันตัวตน Realtime และพื้นที่จัดเก็บ"],
  ["Vercel", "โฮสติ้ง API, Web, Runtime Cache, Queues, Cron และ operational logs"],
  ["Expo", "สร้างและอัปเดตแอป รวมถึงส่ง push notification ผ่าน APNs/FCM"],
  ["OpenAI", "ประมวลผล AI football companion และสร้างข่าวสรุปโดยใช้ข้อมูลเท่าที่จำเป็น"],
  ["Google, Facebook และ Apple", "เข้าสู่ระบบ เชื่อมบัญชี และเพิกถอน token ตามที่รองรับ"],
  ["API-Football", "ข้อมูลการแข่งขัน ลีก ทีม นักเตะ และสถิติฟุตบอล"],
] as const;

const retentionRows = [
  ["บัญชีและข้อมูลโปรไฟล์", "ตลอดอายุบัญชี; ลบจากระบบหลักภายใน 7 วันหลังยืนยันคำขอ"],
  ["รายการโปรด การติดตาม และการตั้งค่า", "ตลอดอายุบัญชีและลบพร้อมบัญชี"],
  ["Push token", "จน logout, token ใช้ไม่ได้ หรือมีการลบบัญชี; purge ภายใน 30 วัน"],
  ["ประวัติการแจ้งเตือน", "30 วัน"],
  ["Personalization events", "ไม่เกิน 180 วัน หรือลบก่อนเมื่อมีการลบบัญชี"],
  ["AI request/response records", "30 วัน"],
  ["News engagement signals", "90 วัน"],
  ["Operational logs", "90 วัน โดยลดข้อมูลระบุตัวบุคคลให้เหลือน้อยที่สุด"],
  ["Security/audit events", "180 วัน และทำให้ user reference ไม่สามารถระบุตัวตนเมื่อทำได้"],
  ["Support requests", "24 เดือนหลังปิดเรื่อง เว้นแต่มีข้อพิพาทที่ยังดำเนินอยู่"],
  ["Encrypted backups", "หมดอายุตามรอบไม่เกิน 30 วัน"],
] as const;

export default function PrivacyPage() {
  return (
    <LegalPage
      description="เอกสารนี้อธิบายว่า Goal เก็บ ใช้ เปิดเผย เก็บรักษา และลบข้อมูลอย่างไร รวมถึงสิทธิและช่องทางติดต่อของผู้ใช้"
      eyebrow="Privacy notice"
      title="นโยบายความเป็นส่วนตัว"
    >
      <section
        className={`rounded-[2rem] border p-6 sm:p-8 ${
          legalIdentity.isReviewed
            ? "border-success/40 bg-success/5"
            : "border-primary/40 bg-primary/5"
        }`}
      >
        <p className="font-label text-sm tracking-[0.15em] text-primary uppercase">
          เวอร์ชัน {privacyPolicyVersion}
        </p>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">ผู้ควบคุมข้อมูลส่วนบุคคล</dt>
            <dd className="mt-1 font-semibold">{legalIdentity.entityName}</dd>
            {legalIdentity.registrationNumber && (
              <dd className="mt-1 text-muted-foreground">
                เลขทะเบียน {legalIdentity.registrationNumber}
              </dd>
            )}
          </div>
          <div>
            <dt className="text-muted-foreground">ที่อยู่</dt>
            <dd className="mt-1 font-semibold">{legalIdentity.address}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">วันที่มีผล</dt>
            <dd className="mt-1 font-semibold">{legalIdentity.effectiveDate}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">สถานะการตรวจทางกฎหมาย</dt>
            <dd className="mt-1 font-semibold">{legalIdentity.reviewDate}</dd>
          </div>
        </dl>
      </section>

      <LegalSection title="ขอบเขตและข้อมูลที่เราเก็บ">
        <p>
          นโยบายนี้ใช้กับเว็บไซต์ <code>goal.co.th</code>, แอป Goal บน iOS/Android และ Goal API
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>ข้อมูลบัญชี เช่น อีเมล ชื่อที่แสดง และรหัสอ้างอิงจาก Google, Facebook หรือ Apple</li>
          <li>ทีม ลีก นักเตะ การแข่งขัน รายการโปรด การติดตาม และการตั้งค่าการแจ้งเตือน</li>
          <li>ข้อมูลอุปกรณ์ เช่น Expo push token ภาษา เขตเวลา เวอร์ชันแอป และระบบปฏิบัติการ</li>
          <li>Session cookies บนเว็บและ session data ใน OS-backed secure storage บน mobile</li>
          <li>
            ข้อมูลการใช้งานที่จำเป็นต่อ personalization ความปลอดภัย ป้องกันการใช้งานผิดปกติ
            และแก้ปัญหา
          </li>
          <li>การเปิดข่าวแบบไม่ซ้ำและสัญญาณ engagement เพื่อจัดอันดับข่าว</li>
          <li>ข้อมูลที่ใช้เรียก AI และผลลัพธ์ เฉพาะเมื่อผู้ใช้เรียกฟีเจอร์ดังกล่าว</li>
          <li>ข้อมูลที่ผู้ใช้ส่งให้ฝ่ายช่วยเหลือและบันทึกการดำเนินการตามคำขอ</li>
        </ul>
        <p>
          Goal ไม่ขายข้อมูลส่วนบุคคลและไม่ใช้ข้อมูลบัญชีหรือข้อความแจ้งเตือนเพื่อโฆษณาข้ามบริการ
        </p>
      </LegalSection>

      <LegalSection title="แหล่งข้อมูลและฐานการประมวลผล">
        <p>
          เราได้รับข้อมูลจากผู้ใช้โดยตรง จากอุปกรณ์ จากผู้ให้บริการเข้าสู่ระบบ
          และจากการทำงานของบริการตามปกติ รวมถึงข้อมูลฟุตบอลสาธารณะจากผู้ให้บริการข้อมูล
        </p>
        <Table className="min-w-[42rem]">
          <TableHeader>
            <TableRow>
              <TableHead>วัตถุประสงค์</TableHead>
              <TableHead>ฐานการประมวลผล</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="whitespace-normal">
                บัญชี รายการโปรด การติดตาม personalization และฟีเจอร์ที่ร้องขอ
              </TableCell>
              <TableCell className="whitespace-normal">
                จำเป็นเพื่อให้บริการตามข้อตกลงกับผู้ใช้
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="whitespace-normal">
                Push notification และความสามารถที่ต้องขออนุญาตจากอุปกรณ์
              </TableCell>
              <TableCell className="whitespace-normal">
                ความยินยอม ซึ่งถอนผ่านการตั้งค่าของระบบหรือแอปได้
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="whitespace-normal">
                ความปลอดภัย ป้องกัน abuse แก้ข้อผิดพลาด และปรับปรุงความเสถียร
              </TableCell>
              <TableCell className="whitespace-normal">
                ประโยชน์โดยชอบด้วยกฎหมาย โดยประเมินผลกระทบต่อผู้ใช้
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="whitespace-normal">
                ตอบคำขอทางกฎหมาย เก็บหลักฐาน และปฏิบัติตามข้อบังคับ
              </TableCell>
              <TableCell className="whitespace-normal">
                หน้าที่ตามกฎหมายหรือการก่อตั้ง/ใช้/ต่อสู้สิทธิเรียกร้อง
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </LegalSection>

      <LegalSection title="ผู้ประมวลผลและการส่งข้อมูล">
        <p>เราเปิดเผยเฉพาะข้อมูลที่จำเป็นให้ผู้ให้บริการต่อไปนี้ตามหน้าที่ของแต่ละราย</p>
        <dl className="grid gap-4 sm:grid-cols-2">
          {processors.map(([name, purpose]) => (
            <div className="rounded-2xl border border-border bg-background p-4" key={name}>
              <dt className="font-semibold text-foreground">{name}</dt>
              <dd className="mt-1 text-sm">{purpose}</dd>
            </div>
          ))}
        </dl>
        <p>
          ผู้ให้บริการบางรายประมวลผลข้อมูลนอกประเทศไทย เราจะใช้ข้อตกลงคุ้มครองข้อมูล มาตรการตามสัญญา
          และการควบคุมทางเทคนิคที่เหมาะสมกับความเสี่ยง
          ลิงก์ข่าวภายนอกอาจทำให้เว็บไซต์ปลายทางได้รับข้อมูลตาม browser เช่น IP address
          และอยู่ภายใต้นโยบายของเว็บไซต์นั้น
        </p>
      </LegalSection>

      <LegalSection title="AI และข่าวฟุตบอล">
        <p>
          AI ใช้ข้อมูลการแข่งขัน ทีม นักเตะ และคำขอที่จำเป็นเพื่อสร้างคำอธิบาย เปรียบเทียบ หรือสรุป
          ระบบตั้งค่า OpenAI application requests เป็น <code>store: false</code>
          และไม่ส่งรายการผู้ใช้ที่ติดตามไปค้นข่าว คำตอบ AI
          อาจคลาดเคลื่อนและไม่ควรใช้เป็นคำแนะนำด้านการพนันหรือการเงิน
        </p>
        <p>
          ข่าวจะแสดงหัวข้อ สรุป และลิงก์อ้างอิงไปยังแหล่งต้นทาง Goal ไม่จัดเก็บหรือเผยแพร่บทความเต็ม
          และอาจแก้ไขหรือถอนสรุปเมื่อแหล่งข่าวแก้ไขข้อเท็จจริง
        </p>
      </LegalSection>

      <LegalSection id="retention" title="ระยะเวลาเก็บรักษา">
        <Table className="min-w-[42rem]">
          <TableHeader>
            <TableRow>
              <TableHead>ประเภทข้อมูล</TableHead>
              <TableHead>ระยะเวลา/การลบ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {retentionRows.map(([dataClass, retention]) => (
              <TableRow key={dataClass}>
                <TableCell className="font-medium whitespace-normal text-foreground">
                  {dataClass}
                </TableCell>
                <TableCell className="whitespace-normal">{retention}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p>
          การระงับทางกฎหมายอาจทำให้ต้องเก็บข้อมูลบางส่วนเท่าที่จำเป็นและนานเท่าที่กฎหมายกำหนด
          โดยจะแจ้งขอบเขตเมื่อไม่ถูกห้ามตามกฎหมาย
        </p>
      </LegalSection>

      <LegalSection id="rights" title="สิทธิและทางเลือกของผู้ใช้">
        <p>
          ภายใต้เงื่อนไขของกฎหมาย ผู้ใช้อาจขอเข้าถึง รับสำเนา แก้ไข โอน คัดค้าน จำกัดการใช้ ลบข้อมูล
          หรือถอนความยินยอม การถอนความยินยอมไม่กระทบการประมวลผลที่ชอบด้วยกฎหมายก่อนหน้า
        </p>
        <p>
          ส่งคำขอจากอีเมลของบัญชีไปที่{" "}
          <a
            className="font-semibold text-primary hover:underline"
            href={`mailto:${legalIdentity.privacyEmail}`}
          >
            {legalIdentity.privacyEmail}
          </a>{" "}
          เราอาจขอข้อมูลเพิ่มเติมเพื่อยืนยันตัวตนโดยจะไม่ขอรหัสผ่านหรือ access token
        </p>
        <p>
          สำหรับการลบบัญชี ดูขั้นตอนที่{" "}
          <Link className="font-semibold text-primary hover:underline" href="/account-deletion">
            หน้าลบบัญชี Goal
          </Link>
        </p>
      </LegalSection>

      <LegalSection title="ความปลอดภัย เด็ก และการเปลี่ยนแปลง">
        <p>
          Goal ใช้การควบคุมสิทธิ์ RLS การเข้ารหัสระหว่างส่ง การแยก environment การจำกัด secrets
          และการบันทึกเหตุการณ์ ไม่มีระบบใดรับประกันความปลอดภัยได้ทั้งหมด
          หากพบเหตุผิดปกติโปรดติดต่อฝ่ายความเป็นส่วนตัวทันที
        </p>
        <p>
          บริการนี้ไม่ได้ออกแบบสำหรับเด็กและเราไม่ตั้งใจเก็บข้อมูลเด็กโดยรู้ตัว
          หากผู้ปกครองเชื่อว่ามีข้อมูลดังกล่าวสามารถขอให้ตรวจสอบและลบได้
        </p>
        <p>
          เมื่อแก้สาระสำคัญ เราจะอัปเดตเวอร์ชันและวันที่มีผลบนหน้านี้
          และแจ้งเพิ่มเติมผ่านแอปหรืออีเมลเมื่อกฎหมายกำหนด
        </p>
      </LegalSection>

      <LegalSection title="ติดต่อและร้องเรียน">
        <address className="not-italic">
          <p className="font-semibold text-foreground">{legalIdentity.entityName}</p>
          <p>{legalIdentity.address}</p>
          <p>
            Privacy:{" "}
            <a
              className="text-primary hover:underline"
              href={`mailto:${legalIdentity.privacyEmail}`}
            >
              {legalIdentity.privacyEmail}
            </a>
          </p>
        </address>
        <p>
          หากไม่ได้รับการแก้ไขตามสิทธิ
          ผู้ใช้สามารถร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล
          หรือหน่วยงานกำกับที่มีอำนาจได้
        </p>
      </LegalSection>
    </LegalPage>
  );
}
