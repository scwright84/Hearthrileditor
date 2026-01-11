"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,_#0f172a,_#020617_60%,_#020617_100%)] px-6 py-16 text-slate-100">
      <div className="absolute -top-24 right-10 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="absolute -bottom-24 left-10 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />
      <Card className="relative w-full max-w-md border border-slate-800 bg-slate-900/80 text-slate-100 shadow-xl backdrop-blur">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            Sign in to Hearthril
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Use any email for local development.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            type="email"
            placeholder="you@hearthrail.dev"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button
            className="w-full"
            disabled={!email || isLoading}
            onClick={async () => {
              setIsLoading(true);
              await signIn("credentials", {
                email,
                callbackUrl: "/projects",
              });
              setIsLoading(false);
            }}
          >
            {isLoading ? "Signing in..." : "Continue"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
