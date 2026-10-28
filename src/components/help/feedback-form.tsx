"use client";

import { Send } from "lucide-react";
import * as React from "react";
import { FormStatus } from "@/components/settings/form-status";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { submitFeedbackAction } from "@/lib/data/feedback-actions";

export function FeedbackForm({ fromPage }: { fromPage: string | null }) {
  const { toast } = useToast();
  const [category, setCategory] = React.useState<"bug" | "idea" | "question" | "other">("idea");
  const [message, setMessage] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [status, setStatus] = React.useState<{ error?: string; success?: string }>({});
  const [pending, start] = React.useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await submitFeedbackAction({ category, message, page: fromPage });
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            setStatus({ error: r.fieldErrors ? undefined : r.error });
            return;
          }
          setErrors({});
          setMessage("");
          setStatus({ success: r.message });
          toast({ tone: "success", title: "Feedback sent", description: "Saved for the product team." });
        });
      }}
    >
      <Field label="What is it about?" htmlFor="fb-category" error={errors.category}>
        <Select id="fb-category" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
          <option value="bug">Something isn’t working</option>
          <option value="idea">An idea or request</option>
          <option value="question">A question</option>
          <option value="other">Something else</option>
        </Select>
      </Field>
      <Field
        label="Your message"
        htmlFor="fb-message"
        error={errors.message}
        hint={<>{message.length}/4000 · Please don’t include client-confidential details.{fromPage ? <> Sent with the page you came from ({fromPage}).</> : null}</>}
      >
        <Textarea
          id="fb-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={4000}
          rows={6}
          required
          placeholder={category === "bug" ? "What did you expect, and what happened instead?" : "Tell us what would make CultureCrash more useful."}
          aria-invalid={Boolean(errors.message)}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !message.trim()}><Send /> {pending ? "Sending…" : "Send feedback"}</Button>
        <FormStatus error={status.error} success={status.success} />
      </div>
    </form>
  );
}
