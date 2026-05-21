import { createContext, useContext, ReactNode } from "react";
import { LOCAL_USER } from "@/lib/localDb";

interface AuthContextType {
  session: { user: typeof LOCAL_USER } | null;
  user: typeof LOCAL_USER | null;
  loading: boolean;
  error: string | null;
  signOut: () => Promise<void>;
  isAllowedUser: boolean;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: false,
  error: null,
  signOut: async () => {},
  isAllowedUser: true,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const user = LOCAL_USER;
  const session = { user };

  const signOut = async () => {
    // No-op for local app
  };

  return (
    <AuthContext.Provider value={{ session, user, loading: false, error: null, signOut, isAllowedUser: true }}>
      {children}
    </AuthContext.Provider>
  );
};
