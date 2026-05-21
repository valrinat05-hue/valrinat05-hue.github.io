import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import ProjectTypeCard from "@/components/ProjectTypeCard";
import FilmStrip from "@/components/FilmStrip";
import { Button } from "@/components/ui/button";
import { FolderOpen } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main id="main-content" className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <h1 className="text-3xl md:text-4xl font-extrabold text-foreground mb-3 animate-fade-up text-balance text-center">
          עריכת סרטים בAI
        </h1>
        <p className="text-muted-foreground mb-12 animate-fade-up stagger-1 text-center">
          בחר את סוג הפרויקט שברצונך ליצור
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-4xl">
          <ProjectTypeCard
            title="סרט ערוך"
            description="סרט מלא עם עריכה מקצועית"
            icon="film"
            type="edited"
            className="animate-fade-up stagger-1"
          />
          <ProjectTypeCard
            title="סרט קצר"
            description="סרט קצר או פרויקט קטן"
            icon="short"
            type="short"
            className="animate-fade-up stagger-2"
          />
          <ProjectTypeCard
            title="טריילר"
            description="טריילר או פרומו לסרט"
            icon="trailer"
            type="trailer"
            className="animate-fade-up stagger-3"
          />
          <ProjectTypeCard
            title="סדרה"
            description="עיצוב וניהול סדרת פרקים"
            icon="film"
            type="series"
            className="animate-fade-up stagger-3"
          />
        </div>
        <Button
          variant="outline"
          size="lg"
          onClick={() => navigate("/my-projects")}
          className="mt-10 gap-2 animate-fade-up stagger-3"
        >
          <FolderOpen className="h-5 w-5" />
          כל הפרויקטים שלי
        </Button>
        <FilmStrip />
      </main>
    </div>
  );
};

export default Index;
