import { forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { Film, Clapperboard, Play } from "lucide-react";

interface ProjectTypeCardProps {
  title: string;
  description: string;
  icon: "film" | "short" | "trailer";
  type: string;
  className?: string;
}

const icons = {
  film: Film,
  short: Clapperboard,
  trailer: Play,
};

const ProjectTypeCard = forwardRef<HTMLButtonElement, ProjectTypeCardProps>(
  ({ title, description, icon, type, className = "" }, ref) => {
    const navigate = useNavigate();
    const Icon = icons[icon];

    return (
      <button
        ref={ref}
        type="button"
        onClick={() => navigate(`/new-project?type=${type}`)}
        aria-label={`יצירת פרויקט מסוג ${title}`}
        className={`group relative flex flex-col items-center gap-5 rounded-xl bg-card p-8 text-center
          shadow-lg shadow-black/20 border border-border
          transition-all duration-300 ease-out
          hover:shadow-xl hover:shadow-primary/10 hover:border-primary/40 hover:-translate-y-1
          active:scale-[0.97] active:translate-y-0
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background
          ${className}`}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
          <Icon className="h-8 w-8" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-foreground mb-1">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </button>
    );
  }
);

ProjectTypeCard.displayName = "ProjectTypeCard";

export default ProjectTypeCard;
