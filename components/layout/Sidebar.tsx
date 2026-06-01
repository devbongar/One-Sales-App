'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  UserPlus, CalendarCheck, BookOpen, DollarSign,
  ShieldCheck, FolderOpen, MessageSquare, Receipt, CreditCard,
  Wallet, Banknote, BookMarked, Users, UserCog, LayoutDashboard,
  X, ChevronDown, LogOut, Home, Settings, Calculator, Database,
} from 'lucide-react';
import { NavGroup } from '@/types';
import { clearSession } from '@/lib/auth';
import { useRouter } from 'next/navigation';

const NAV: NavGroup[] = [
  {
    title: 'Sales Transaction',
    items: [
      { label: 'Client Registration',          href: '/sales/client-registration', icon: 'UserPlus' },
      { label: 'Reservation',                  href: '/sales/reservation',          icon: 'CalendarCheck' },
      { label: 'Booking',                      href: '/sales/booking',              icon: 'BookOpen' },
      { label: 'Sales Commission',             href: '/sales/sales-commission',     icon: 'DollarSign' },
      { label: 'Generate Sample Computation',  href: '/sales/sample-computation',   icon: 'Calculator'  },
    ],
  },
  {
    title: 'Account Management',
    items: [
      { label: "Buyer's Verification",   href: '/account/buyers-verification', icon: 'ShieldCheck' },
      { label: "Buyer's Foldering",      href: '/account/buyers-foldering',    icon: 'FolderOpen' },
      { label: 'Request and Inquiry',    href: '/account/request-inquiry',     icon: 'MessageSquare', comingSoon: true },
      { label: 'Billing and Collection', href: '/account/billing-collection',  icon: 'Receipt',       comingSoon: true },
      { label: 'End-Use Financing',      href: '/account/end-use-financing',   icon: 'CreditCard',    comingSoon: true },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Commission Payout',    href: '/finance/commission-payout',      icon: 'Wallet',    comingSoon: true },
      { label: "Buyer's Payment",      href: '/finance/buyers-payment',         icon: 'Banknote' },
      { label: 'Collection Posting',   href: '/finance/receivable-database',    icon: 'Database' },
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

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  UserPlus, CalendarCheck, BookOpen, DollarSign,
  ShieldCheck, FolderOpen, MessageSquare, Receipt, CreditCard,
  Wallet, Banknote, BookMarked, Users, UserCog, LayoutDashboard, Calculator, Database,
};

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  userName?: string;
  userRole?: string;
}

export default function Sidebar({ open, onClose, userName, userRole }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  // All groups open by default
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(NAV.map((g) => [g.title, true]))
  );

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const toggleGroup = (title: string) => {
    setOpenGroups((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const handleLogout = () => {
    clearSession();
    router.push('/login');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className="relative w-[80vw] max-w-xs h-full flex flex-col animate-slide-left overflow-y-auto"
        style={{
          background: 'linear-gradient(160deg, #D94F35 0%, #C03D25 40%, #8B2515 100%)',
          borderRight: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-14 pb-5 border-b border-white/15">
          <div>
            <p className="text-[10px] text-white/50 font-semibold uppercase tracking-widest mb-0.5">
              Welcome
            </p>
            <p className="text-white font-bold text-base leading-tight">
              {userName ?? 'Sales Agent'}
            </p>
            <p className="text-white/50 text-xs mt-0.5 capitalize">{userRole ?? 'agent'}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-2xl bg-white/15 border border-white/20 text-white hover:bg-white/25 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Home button */}
        <div className="px-3 pt-3 pb-1">
          <Link
            href="/home"
            onClick={onClose}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white text-[#C03D25] font-semibold text-sm shadow-[0_2px_12px_rgba(0,0,0,0.2)] transition-all active:scale-[0.98]"
          >
            <Home size={17} />
            Home
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((group) => {
            const isOpen = openGroups[group.title];
            const hasActive = group.items.some((i) => pathname === i.href);

            return (
              <div key={group.title}>
                {/* Group header — collapsible toggle */}
                <button
                  onClick={() => toggleGroup(group.title)}
                  className={`
                    w-full flex items-center justify-between px-3 py-2.5 rounded-2xl
                    transition-all duration-200 mb-0.5
                    ${hasActive && !isOpen
                      ? 'bg-white/20 text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }
                  `}
                >
                  <span className="text-xs font-bold uppercase tracking-[0.12em]">
                    {group.title}
                  </span>
                  <ChevronDown
                    size={14}
                    className={`transition-transform duration-300 text-white/50 ${isOpen ? 'rotate-180' : 'rotate-0'}`}
                  />
                </button>

                {/* Collapsible items */}
                <div
                  className="overflow-hidden transition-all duration-300"
                  style={{ maxHeight: isOpen ? `${group.items.length * 52}px` : '0px' }}
                >
                  <ul className="space-y-0.5 pb-2 pl-1">
                    {group.items.map((item) => {
                      const Icon = ICONS[item.icon ?? ''];
                      const active = pathname === item.href;

                      if (item.comingSoon) {
                        return (
                          <li key={item.href}>
                            <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium text-white/35 cursor-default">
                              {Icon && <Icon size={16} className="text-white/25 shrink-0" />}
                              <span className="flex-1 truncate">{item.label}</span>
                              <span className="text-[9px] font-semibold bg-white/15 text-white/50 px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap">
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
                            onClick={onClose}
                            className={`
                              flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium
                              transition-all duration-150
                              ${active
                                ? 'bg-white text-[#C03D25] shadow-[0_2px_12px_rgba(0,0,0,0.2)]'
                                : 'text-white/80 hover:bg-white/15 hover:text-white'
                              }
                            `}
                          >
                            {Icon && (
                              <Icon
                                size={16}
                                className={active ? 'text-[#C03D25]' : 'text-white/60'}
                              />
                            )}
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            );
          })}
        </nav>

        {/* Settings + Sign Out */}
        <div className="px-4 pb-10 pt-3 border-t border-white/15 space-y-2">
          <Link
            href="/settings"
            onClick={onClose}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold text-white bg-white/15 border border-white/20 hover:bg-white/25 transition-colors active:scale-[0.98]"
          >
            <Settings size={16} />
            System Settings
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold text-white bg-white/15 border border-white/20 hover:bg-white/25 transition-colors active:scale-[0.98]"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>
    </div>
  );
}
