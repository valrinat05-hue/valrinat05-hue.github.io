import { usePremium } from "@/contexts/PremiumContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Crown, Sparkles, Zap } from "lucide-react";

const plans = [
  {
    name: "חינם",
    price: "₪0",
    period: "/חודש",
    current: true,
    features: [
      "3 פרויקטים",
      "AI Director — סגנון קולנועי",
      "מיזוג בסיסי",
      "ייצוא 1080p",
    ],
  },
  {
    name: "פרימיום",
    price: "₪49",
    period: "/חודש",
    current: false,
    highlight: true,
    features: [
      "פרויקטים ללא הגבלה",
      "כל סגנונות AI Director",
      "מעברים מותאמים אישית",
      "פסקול פרימיום",
      "ייצוא 4K",
      "תמיכה מועדפת",
    ],
  },
];

const UpgradeDialog = () => {
  const { showUpgradeDialog, setShowUpgradeDialog } = usePremium();

  return (
    <Dialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Crown className="h-6 w-6 text-yellow-400" />
            שדרג לפרימיום
          </DialogTitle>
          <DialogDescription>
            קבל גישה לכל הכלים המתקדמים ליצירת סרטים מקצועיים
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-xl border p-4 space-y-3 ${
                plan.highlight
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border"
              }`}
            >
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold">{plan.price}</span>
                <span className="text-sm text-muted-foreground">{plan.period}</span>
              </div>
              <h3 className="font-semibold flex items-center gap-1.5">
                {plan.highlight && <Sparkles className="h-4 w-4 text-primary" />}
                {plan.name}
              </h3>
              <ul className="space-y-1.5 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              {plan.current ? (
                <Button variant="outline" className="w-full" disabled>
                  התוכנית הנוכחית
                </Button>
              ) : (
                <Button className="w-full gap-1.5">
                  <Zap className="h-4 w-4" />
                  שדרג עכשיו
                </Button>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UpgradeDialog;
