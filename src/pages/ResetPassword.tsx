import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { hasRecoveryIntent, stripAuthParamsFromUrl } from "@/lib/auth";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [checkingRecovery, setCheckingRecovery] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    let mounted = true;
    let recoveryResolved = false;

    const clearRecoveryParams = () => {
      window.history.replaceState({}, document.title, stripAuthParamsFromUrl());
    };

    const setRecoveryReady = (session: Session | null) => {
      if (!mounted || !session || recoveryResolved) return;
      recoveryResolved = true;
      setReady(true);
      setCheckingRecovery(false);
      setErrorMessage(null);
      clearRecoveryParams();
    };

    const setRecoveryError = (message: string) => {
      if (!mounted || recoveryResolved) return;
      setReady(false);
      setCheckingRecovery(false);
      setErrorMessage(message);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        setRecoveryReady(session);
        return;
      }

      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session && (hasRecoveryIntent() || window.location.pathname === "/reset-password")) {
        setRecoveryReady(session);
      }
    });

    const waitForRecoverySession = async () => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const { data, error } = await supabase.auth.getSession();

        if (!mounted || recoveryResolved) return;

        if (error) {
          setRecoveryError("לא הצלחנו לאמת את קישור האיפוס. אפשר לבקש קישור חדש ולנסות שוב.");
          return;
        }

        if (data.session) {
          setRecoveryReady(data.session);
          return;
        }

        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }

      setRecoveryError("קישור האיפוס לא תקין או שפג תוקפו. אפשר לבקש קישור חדש בקלות.");
    };

    void waitForRecoverySession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast.error("הסיסמה חייבת להכיל לפחות 6 תווים");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("שתי הסיסמאות חייבות להיות זהות");
      return;
    }

    setLoading(true);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!data.session) {
        throw new Error("פג תוקף החיבור לעדכון הסיסמה. בקש קישור איפוס חדש ונסה שוב.");
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      toast.success("הסיסמה עודכנה בהצלחה!");
      navigate("/", { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "שגיאה בעדכון הסיסמה";
      const friendlyMessage = /session/i.test(message)
        ? "פג תוקף קישור האיפוס או שהחיבור לא הושלם. בקש קישור חדש ונסה שוב."
        : message;
      toast.error(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main id="main-content" className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">איפוס סיסמה</h1>
            <p className="text-sm text-muted-foreground mt-1" aria-live="polite">
              {ready ? "הזן סיסמה חדשה" : checkingRecovery ? "מאמתים את קישור האיפוס..." : "צריך קישור איפוס חדש"}
            </p>
          </div>

          {errorMessage && !checkingRecovery && (
            <div className="space-y-4 rounded-lg border border-border bg-card p-4" role="alert">
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" className="flex-1" onClick={() => navigate("/auth?mode=forgot")}>בקשת קישור חדש</Button>
                <Button type="button" variant="outline" className="flex-1" onClick={() => navigate("/auth")}>חזרה להתחברות</Button>
              </div>
            </div>
          )}

          {ready ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">סיסמה חדשה</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="pl-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? "הסתרת הסיסמה" : "הצגת הסיסמה"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">אימות סיסמה חדשה</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="pl-10"
                    aria-invalid={confirmPassword.length > 0 && password !== confirmPassword}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showConfirmPassword ? "הסתרת אימות הסיסמה" : "הצגת אימות הסיסמה"}
                    aria-pressed={showConfirmPassword}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">כדאי לבחור סיסמה חדשה שקל לזכור ובטוחה לשימוש.</p>
              </div>
              <Button type="submit" className="w-full" disabled={loading} aria-busy={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                עדכן סיסמה
              </Button>
            </form>
          ) : checkingRecovery ? (
            <div className="flex flex-col items-center justify-center gap-3" role="status" aria-live="polite" aria-busy="true">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">רק עוד רגע, אנחנו מכינים את עמוד האיפוס.</p>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
};

export default ResetPassword;
