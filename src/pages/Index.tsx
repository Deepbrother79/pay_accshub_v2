// Landing page
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Index = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-6 px-4">
        <h1 className="text-4xl font-bold">Token Transaction Hub</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Secure login, USD top-ups via NowPayments, and token generation from your dashboard.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button asChild>
            <Link to="/auth">Get Started</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/dashboard">Go to Dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Index;
