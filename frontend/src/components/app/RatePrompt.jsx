import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Heart } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const native = () => !!window.Capacitor?.isNativePlatform?.();

// "Enjoying Lumo?" — happy users get the native store rating sheet, others can tell us what to fix.
export const RatePrompt = () => {
  const { user } = useAuth();
  const [step, setStep] = useState(null);
  const [text, setText] = useState("");
  const uid = user && user.id;
  useEffect(() => {
    if (!uid || !(native() || localStorage.getItem("lumo_force_rate_prompt"))) return;
    const t = setTimeout(() => api.get("/me/rate-prompt").then(({ data }) => data.show && setStep("ask")).catch(() => {}), 4000);
    return () => clearTimeout(t);
  }, [uid]);
  const answer = (a) => api.post("/me/rate-prompt", { answer: a }).catch(() => {});
  const happy = async () => {
    answer("happy");
    setStep(null);
    try { const { InAppReview } = await import("@capacitor-community/in-app-review"); await InAppReview.requestReview(); } catch (_) { /* web */ }
  };
  const send = async () => {
    if (text.trim().length > 1) await api.post("/me/app-feedback", { message: text }).catch(() => {});
    toast.success("Thanks — we read every message");
    setStep(null);
  };
  const close = () => { if (step === "ask") answer("later"); setStep(null); };
  return (
    <Dialog open={!!step} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-sm rounded-3xl text-center" data-testid="rate-prompt">
        {step === "ask" ? (<>
          <Heart className="w-10 h-10 mx-auto text-rose-500" />
          <DialogTitle className="font-display text-2xl">Enjoying Lumo?</DialogTitle>
          <DialogDescription>Your answer helps us make the app better.</DialogDescription>
          <div className="grid gap-2 mt-2">
            <button onClick={happy} className="h-12 rounded-full bg-slate-950 text-white font-semibold" data-testid="rate-prompt-yes">Yes, I love it</button>
            <button onClick={() => { answer("unhappy"); setStep("feedback"); }} className="h-12 rounded-full border border-slate-200 font-semibold" data-testid="rate-prompt-no">Not really</button>
          </div>
        </>) : (<>
          <DialogTitle className="font-display text-2xl">What could be better?</DialogTitle>
          <DialogDescription>Tell us what went wrong and we'll work on it.</DialogDescription>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Your feedback" data-testid="rate-prompt-feedback" />
          <button onClick={send} className="h-12 rounded-full bg-slate-950 text-white font-semibold mt-2" data-testid="rate-prompt-send">Send feedback</button>
        </>)}
      </DialogContent>
    </Dialog>
  );
};
