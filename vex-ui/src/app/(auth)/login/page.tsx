import { LoginButton } from "@/components/auth/LoginButton";
import { ShieldCheck } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-8 px-4">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-3">
              <ShieldCheck className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">VEX Manager</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to manage VEX statements and vulnerability suppressions
          </p>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
          <LoginButton />
          <p className="text-center text-xs text-muted-foreground">
            Requires GitHub org membership. Teams are synced from your GitHub organization.
          </p>
        </div>
      </div>
    </div>
  );
}
