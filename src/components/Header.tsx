import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePremium } from "@/contexts/PremiumContext";
import { Button } from "@/components/ui/button";
import { LogOut, Crown } from "lucide-react";
import logo from "@/assets/logo.png";

const Header = forwardRef<HTMLElement>((_props, ref) => {
  const { user, signOut } = useAuth();
  const { isPremium, setShowUpgradeDialog } = usePremium();

  return (
    <header ref={ref} className="w-full border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container flex items-center justify-between py-3">
        <Link to="/" className="flex items-center gap-3 group">
          <img src={logo} alt="Film Production" className="h-10 w-10 transition-transform group-hover:scale-105 group-active:scale-95" />
          <span className="text-lg font-bold text-foreground tracking-tight">עריכת סרטים בAI</span>
        </Link>
        {user && (
          <div className="flex items-center gap-3">
            {!isPremium && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowUpgradeDialog(true)}
                className="gap-1.5 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 hover:text-yellow-300"
              >
                <Crown className="h-4 w-4" />
                <span className="hidden sm:inline">שדרג לפרימיום</span>
              </Button>
            )}
            <span className="text-sm text-muted-foreground hidden sm:inline">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-1">
              <LogOut className="h-4 w-4" />
              יציאה
            </Button>
          </div>
        )}
      </div>
    </header>
  );
});

Header.displayName = "Header";

export default Header;
