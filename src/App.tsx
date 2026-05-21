import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { PremiumProvider } from "@/contexts/PremiumContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import UpgradeDialog from "@/components/UpgradeDialog";
import Index from "./pages/Index";
import NewProject from "./pages/NewProject";
import Editor from "./pages/Editor";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import MyProjects from "./pages/MyProjects";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <PremiumProvider>
            <UpgradeDialog />
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/my-projects" element={<ProtectedRoute><MyProjects /></ProtectedRoute>} />
              <Route path="/new-project" element={<ProtectedRoute><NewProject /></ProtectedRoute>} />
              <Route path="/editor/:projectId" element={<ProtectedRoute><Editor /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </PremiumProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
