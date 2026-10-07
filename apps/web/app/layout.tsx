import type { Metadata } from 'next';
import Link from 'next/link';
import { Headphones, Music2, CalendarDays, Newspaper, Sparkles, UserRound } from 'lucide-react';
import './globals.css';
import './community.css';

export const metadata: Metadata = { title: 'Encore — ตามศิลปิน ไปคอนเสิร์ต', description: 'รวมศิลปิน คอนเสิร์ต ข่าว และผู้ช่วยวางแผนสำหรับแฟนเพลง' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body>
    <a className="skip-link" href="#main-content">ข้ามไปเนื้อหา</a>
    <header className="site-header"><div className="container nav-inner">
      <Link className="brand" href="/"><span className="brand-icon"><Headphones size={22}/></span><span>encore<span className="brand-dot">.</span></span></Link>
      <nav aria-label="เมนูหลัก"><Link href="/news"><Newspaper size={17}/> ฟีด</Link><Link href="/artists"><Music2 size={17}/> ศิลปิน</Link><Link href="/concerts"><CalendarDays size={17}/> คอนเสิร์ต</Link><Link href="/assistant"><Sparkles size={17}/> ผู้ช่วย AI</Link></nav>
      <Link className="account-link" href="/account"><UserRound size={18}/><span>บัญชีของฉัน</span></Link>
    </div></header>
    <main id="main-content" tabIndex={-1}>{children}</main>
    <footer className="site-footer"><div className="container"><strong>encore.</strong><span>ค้นพบศิลปินและวางแผนไปดูการแสดงจากข้อมูลที่มีแหล่งอ้างอิง</span><Link href="/status">สถานะข้อมูล</Link></div></footer>
  </body></html>;
}
