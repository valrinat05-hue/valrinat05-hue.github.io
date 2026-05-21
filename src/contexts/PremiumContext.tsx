import { createContext, useContext, useState, ReactNode } from "react";

interface PremiumContextType {
  isPremium: boolean;
  showUpgradeDialog: boolean;
  setShowUpgradeDialog: (show: boolean) => void;
  lockedFeatures: string[];
}

const PremiumContext = createContext<PremiumContextType>({
  isPremium: false,
  showUpgradeDialog: false,
  setShowUpgradeDialog: () => {},
  lockedFeatures: [],
});

export const usePremium = () => useContext(PremiumContext);

const LOCKED_FEATURES = [
  "ai-director-tiktok",
  "ai-director-emotional",
  "soundtrack-premium",
  "export-4k",
  "custom-transitions",
];

export const PremiumProvider = ({ children }: { children: ReactNode }) => {
  // TODO: Check actual subscription status from Stripe/DB
  const [isPremium] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  return (
    <PremiumContext.Provider
      value={{
        isPremium,
        showUpgradeDialog,
        setShowUpgradeDialog,
        lockedFeatures: isPremium ? [] : LOCKED_FEATURES,
      }}
    >
      {children}
    </PremiumContext.Provider>
  );
};
