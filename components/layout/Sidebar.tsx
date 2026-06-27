'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  UserPlus, CalendarCheck, BookOpen, DollarSign,
  ShieldCheck, FolderOpen, MessageSquare, Receipt, CreditCard,
  Wallet, Banknote, BookMarked, Users, UserCog, LayoutDashboard,
  X, ChevronDown, LogOut, Home, Settings, Database, Mail, Paperclip, BookmarkCheck, Monitor,
} from 'lucide-react';
import { NavGroup } from '@/types';
import { signOut } from '@/lib/auth';
import { useRouter } from 'next/navigation';

const NAV: NavGroup[] = [
  {
    title: 'Sales Transaction',
    items: [
      { label: 'Client Registration',         href: '/sales/client-registration', icon: 'UserPlus' },
      { label: 'Presentation',               href: '/sales/presentation',         icon: 'Monitor' },
      { label: 'Reservation',                 href: '/sales/reservation',         icon: 'CalendarCheck' },
      { label: 'Booking',                     href: '/sales/booking',             icon: 'BookOpen' },
      { label: 'Sales Commission',            href: '/sales/sales-commission',    icon: 'DollarSign' },
    ],
  },
  {
    title: 'Account Management',
    items: [
      { label: "Buyer's Verification", href: '/account/buyers-verification', icon: 'ShieldCheck' },
      { label: "Buyer's Foldering",    href: '/account/buyers-foldering',    icon: 'FolderOpen' },
      { label: 'Request and Inquiry',  href: '/account/request-inquiry',     icon: 'MessageSquare' },
      { label: 'Billing and Collection', href: '/account/billing-collection', icon: 'Receipt' },
      { label: 'End-Use Financing',    href: '/account/end-use-financing',   icon: 'CreditCard',    comingSoon: true },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Commission Payout',  href: '/finance/commission-payout',   icon: 'Wallet' },
      { label: "Buyer's Payment",    href: '/finance/buyers-payment',      icon: 'Banknote' },
      { label: 'Collection Posting', href: '/finance/collection-posting',  icon: 'Database' },
    ],
  },
  {
    title: "User's Registration",
    items: [
      { label: 'Broker Accreditation', href: '/users/broker-accreditation', icon: 'ShieldCheck' },
      { label: 'Seller Recruitment',   href: '/users/seller-recruitment',   icon: 'Users' },
      { label: "User's Profile",       href: '/users/profile',              icon: 'UserCog',        comingSoon: true },
      { label: 'Admin User',           href: '/users/admin',                icon: 'LayoutDashboard' },
    ],
  },
];

const PRIVILEGED_ROLES = ['All Access', 'Sales Director', 'Account Management', 'Finance Verification'];

const SELLER_ALLOWED_HREFS = new Set([
  '/sales/client-registration',
  '/sales/presentation',
  '/sales/reservation',
  '/sales/booking',
  '/sales/quotations',
  '/sales/sales-commission',
  '/account/buyers-foldering',
  '/account/request-inquiry',
]);

const DIRECTOR_ALLOWED_HREFS = new Set([
  '/sales/client-registration',
  '/sales/presentation',
  '/sales/reservation',
  '/sales/booking',
  '/sales/quotations',
  '/sales/sales-commission',
  '/account/buyers-foldering',
]);

const AMD_ALLOWED_HREFS = new Set([
  '/sales/booking',
  '/account/buyers-verification',
  '/account/buyers-foldering',
  '/account/request-inquiry',
  '/account/billing-collection',
  '/account/end-use-financing',
]);

const FINANCE_ALLOWED_HREFS = new Set([
  '/finance/commission-payout',
  '/finance/buyers-payment',
  '/finance/collection-posting',
]);

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  UserPlus, CalendarCheck, BookOpen, DollarSign,
  ShieldCheck, FolderOpen, MessageSquare, Receipt, CreditCard,
  Wallet, Banknote, BookMarked, Users, UserCog, LayoutDashboard, Database, Paperclip, BookmarkCheck, Monitor,
};

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  userName?: string;
  displayName?: string | null;
  userRole?: string;
}

function getInitials(name?: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const ANIM_DURATION = 260;

export default function Sidebar({ open, onClose, userName, displayName, userRole }: SidebarProps) {
  const pathname = usePathname();
  const router   = useRouter();
  const [closing, setClosing] = useState(false);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(NAV.map((g) => [g.title, true]))
  );

  useEffect(() => {
    if (open) {
      setClosing(false);
      document.body.style.overflow = 'hidden';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onClose();
    }, ANIM_DURATION);
  };

  const toggleGroup = (title: string) =>
    setOpenGroups((prev) => ({ ...prev, [title]: !prev[title] }));

  const handleLogout = () => {
    signOut();
    router.push('/login');
  };

  if (!open) return null;

  const initials = getInitials(displayName || userName);
  const isSeller   = !PRIVILEGED_ROLES.includes(userRole ?? '');
  const isDirector = userRole === 'Sales Director';
  const isAMD      = userRole === 'Account Management';
  const isFinance  = userRole === 'Finance Verification';
  const allowedHrefs = isFinance  ? FINANCE_ALLOWED_HREFS
    : isSeller   ? SELLER_ALLOWED_HREFS
    : isDirector ? DIRECTOR_ALLOWED_HREFS
    : isAMD      ? AMD_ALLOWED_HREFS
    : null;
  const visibleGroups = NAV.map((group) => ({
    ...group,
    items: allowedHrefs ? group.items.filter((item) => allowedHrefs.has(item.href)) : group.items,
  })).filter((group) => group.items.length > 0);

  return (
    <>
      <style>{`
        @keyframes backdropFadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes backdropFadeOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes panelSlideIn    { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        @keyframes panelSlideOut   { from { transform: translateX(0); } to { transform: translateX(-100%); } }

        @media (hover: hover) and (pointer: fine) {
          .sb-item:hover      { background: rgba(255,255,255,0.12); color: rgba(255,255,255,1); }
          .sb-footer:hover    { background: rgba(255,255,255,0.10); color: rgba(255,255,255,1); }
        }
      `}</style>

      <div className="fixed inset-0 z-50 flex">

        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/50"
          style={{ animation: `${closing ? 'backdropFadeOut' : 'backdropFadeIn'} ${ANIM_DURATION}ms cubic-bezier(0.23,1,0.32,1) both` }}
          onClick={handleClose}
        />

        {/* Panel */}
        <aside
          className="relative w-[80vw] max-w-[300px] h-full flex flex-col overflow-y-auto"
          style={{
            background: 'linear-gradient(170deg, #E05A3A 0%, #C03D25 45%, #8B2515 100%)',
            animation: `${closing ? 'panelSlideOut' : 'panelSlideIn'} ${ANIM_DURATION}ms cubic-bezier(0.22,1,0.36,1) both`,
            boxShadow: '4px 0 40px rgba(0,0,0,0.35)',
          }}
        >

          {/* ── Header ── */}
          <div className="px-5 pb-5" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 20px)' }}>
            <div className="flex items-center justify-between">

              {/* Avatar + identity */}
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(255,255,255,0.18)' }}
                >
                  <span className="text-white font-bold text-base tracking-tight">{initials}</span>
                </div>
                <div>
                  <p className="text-white font-bold text-[15px] leading-tight">
                    {displayName || userName || '—'}
                  </p>
                  {displayName && userName && (
                    <p className="text-white/40 text-[10px] leading-tight">{userName}</p>
                  )}
                  <p className="text-white/55 text-[11px] mt-0.5">
                    {userRole || '—'}
                  </p>
                </div>
              </div>

              {/* Close */}
              <button
                onClick={handleClose}
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 active:scale-[0.92]"
                style={{
                  background: 'rgba(255,255,255,0.12)',
                  transition: 'transform 100ms ease-out',
                }}
              >
                <X size={16} className="text-white" />
              </button>
            </div>
          </div>

          {/* ── Home ── */}
          <div className="px-3 pb-2">
            <Link
              href="/home"
              onClick={handleClose}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold active:scale-[0.97] ${
                pathname === '/home'
                  ? 'bg-white text-[#C03D25] shadow-[0_2px_16px_rgba(0,0,0,0.2)]'
                  : 'sb-item text-white/90'
              }`}
              style={{ transition: 'background-color 150ms ease, color 150ms ease, transform 100ms ease-out' }}
            >
              <Home size={17} className={pathname === '/home' ? 'text-[#C03D25]' : 'text-white/70'} />
              Home
            </Link>
          </div>

          {/* ── Divider ── */}
          <div className="mx-4 mb-2" style={{ height: '1px', background: 'rgba(255,255,255,0.10)' }} />

          {/* ── Nav groups ── */}
          <nav className="flex-1 px-3 space-y-0.5 pb-4">
            {visibleGroups.map((group) => {
              const isOpen    = openGroups[group.title];
              const hasActive = group.items.some((i) => pathname === i.href);

              return (
                <div key={group.title}>

                  {/* Section header */}
                  <button
                    onClick={() => toggleGroup(group.title)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl active:scale-[0.98]"
                    style={{ transition: 'transform 100ms ease-out' }}
                  >
                    <span
                      className="text-[10px] font-bold uppercase tracking-[0.14em]"
                      style={{ color: hasActive && !isOpen ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)' }}
                    >
                      {group.title}
                    </span>
                    <ChevronDown
                      size={13}
                      style={{
                        color: 'rgba(255,255,255,0.35)',
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 200ms cubic-bezier(0.23,1,0.32,1)',
                      }}
                    />
                  </button>

                  {/* CSS grid collapse — animates real content height, no layout thrash */}
                  <div
                    className="grid"
                    style={{
                      gridTemplateRows: isOpen ? '1fr' : '0fr',
                      transition: 'grid-template-rows 250ms cubic-bezier(0.23,1,0.32,1)',
                    }}
                  >
                    <div className="overflow-hidden">
                      <ul className="space-y-0.5 pb-1">
                        {group.items.map((item) => {
                          const Icon   = ICONS[item.icon ?? ''];
                          const active = pathname === item.href;

                          if (item.comingSoon) {
                            return (
                              <li key={item.href}>
                                <div
                                  className="flex items-center gap-3 px-3 py-2.5 rounded-2xl cursor-default"
                                  style={{ opacity: 0.35 }}
                                >
                                  {Icon && <Icon size={15} className="text-white shrink-0" />}
                                  <span className="flex-1 truncate text-[13px] font-medium text-white">{item.label}</span>
                                  <span
                                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap text-white"
                                    style={{ background: 'rgba(255,255,255,0.18)' }}
                                  >
                                    Soon
                                  </span>
                                </div>
                              </li>
                            );
                          }

                          return (
                            <li key={item.href}>
                              <Link
                                href={item.href}
                                onClick={handleClose}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[13px] font-medium active:scale-[0.97] ${
                                  active
                                    ? 'bg-white text-[#C03D25] shadow-[0_2px_12px_rgba(0,0,0,0.18)]'
                                    : 'sb-item text-white/80'
                                }`}
                                style={{ transition: 'background-color 150ms ease, color 150ms ease, transform 100ms ease-out' }}
                              >
                                {Icon && (
                                  <Icon
                                    size={15}
                                    className={active ? 'text-[#C03D25] shrink-0' : 'text-white/55 shrink-0'}
                                  />
                                )}
                                <span className="truncate">{item.label}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>

                </div>
              );
            })}
          </nav>

          {/* ── Footer ── */}
          <div
            className="px-4 pb-10 pt-3 space-y-1"
            style={{ borderTop: '1px solid rgba(255,255,255,0.10)' }}
          >
            {!isSeller && !isDirector && !isAMD && !isFinance && (
              <Link
                href="/settings"
                onClick={handleClose}
                className="sb-footer w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-[13px] font-medium text-white/75 active:scale-[0.97]"
                style={{ transition: 'background-color 150ms ease, color 150ms ease, transform 100ms ease-out' }}
              >
                <Settings size={15} className="text-white/50 shrink-0" />
                System Settings
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="sb-footer w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-[13px] font-medium active:scale-[0.97]"
              style={{ color: 'rgba(255,200,190,0.85)', transition: 'background-color 150ms ease, transform 100ms ease-out' }}
            >
              <LogOut size={15} style={{ color: 'rgba(255,180,165,0.7)' }} className="shrink-0" />
              Sign Out
            </button>
          </div>

        </aside>
      </div>
    </>
  );
}
