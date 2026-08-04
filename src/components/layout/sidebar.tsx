"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import Image from "next/image";
import {
  LayoutDashboard,
  FileText,
  Users,
  UserCog,
  Upload,
  LogOut,
  BarChart3,
  Menu,
  ClipboardList,
  FolderOpen,
  CalendarClock,
  IdCard,
  Coins,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";

const RAPPORTINI_ENABLED =
  process.env.NEXT_PUBLIC_RAPPORTINI_ENABLED === "true";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["ADMIN", "OPERATORE"] },
  { href: "/preventivi", label: "Preventivi", icon: FileText, roles: ["ADMIN", "OPERATORE"] },
  ...(RAPPORTINI_ENABLED
    ? [{ href: "/rapportini", label: "Rapportini", icon: ClipboardList, roles: ["ADMIN", "OPERATORE"] }]
    : []),
  { href: "/documenti", label: "Documenti", icon: FolderOpen, roles: ["ADMIN", "OPERATORE"] },
  { href: "/scadenze", label: "Scadenze", icon: CalendarClock, roles: ["ADMIN", "OPERATORE"] },
  { href: "/statistiche", label: "Statistiche", icon: BarChart3, roles: ["ADMIN", "OPERATORE"] },
  { href: "/clienti", label: "Clienti", icon: Users, roles: ["ADMIN", "OPERATORE"] },
  { href: "/dipendenti", label: "Dipendenti", icon: IdCard, roles: ["ADMIN"] },
  { href: "/costi", label: "Costi", icon: Coins, roles: ["ADMIN"] },
  { href: "/configurazione", label: "Configurazione", icon: Settings, roles: ["ADMIN"] },
  { href: "/admin/utenti", label: "Utenti", icon: UserCog, roles: ["ADMIN"] },
  { href: "/import", label: "Importa XLSX", icon: Upload, roles: ["ADMIN"] },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role ?? "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Logo */}
      <div className="flex items-center px-6 py-5 border-b border-gray-100">
        <Image
          src="/logo_mistral.jpg"
          alt="Mistral Impianti"
          width={331}
          height={152}
          className="h-10 w-auto"
          priority
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems
          .filter((item) => item.roles.includes(role))
          .map((item) => {
            const Icon = item.icon;
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-sky-50 text-sky-800"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
      </nav>

      {/* User info */}
      <div className="px-4 py-4 border-t border-gray-100">
        <p className="text-xs text-gray-500 truncate">{session?.user?.email}</p>
        <p className="text-xs font-medium text-gray-700 mb-2">{session?.user?.name}</p>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-gray-600 hover:text-red-600"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Esci
        </Button>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 min-h-screen bg-white border-r border-gray-200 shadow-sm">
      <SidebarContent />
    </aside>
  );
}

export function MobileTopbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="Apri menu" />
          }
        >
          <Menu className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Menu di navigazione</SheetTitle>
          <SidebarContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <Image
        src="/logo_mistral.jpg"
        alt="Mistral Impianti"
        width={331}
        height={152}
        className="h-8 w-auto"
        priority
      />
    </header>
  );
}
