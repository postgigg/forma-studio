import { useEffect, useState } from "react";
import { designerRequest, DesignerRequestError, type DesignJob } from "./ai";

// Views already poll their jobs. Only read a small status summary when a view
// stops doing so, keeping the rail indicator alive without resubmitting work.
export function useDesignerActivity() {
  const [activity, setActivity] = useState({ count: 0, stage: "", photos: 0, photoStage: "" });
  useEffect(() => {
    const jobs = new Map<string, { seen: number; active: boolean; stage: string; route: string }>();
    let stopped = false, polling = false, token: string | undefined;
    try {
      for (const [key, route] of [["forma:ai-job", "jobs"], ["forma:photo-job", "photos"]]) {
        const id = sessionStorage.getItem(key);
        if (id) jobs.set(`${route}/${id}`, { seen: 0, active: false, stage: "", route });
      }
    } catch { /* Storage is optional for an activity indicator. */ }
    const update = () => {
      if (stopped) return;
      const active = [...jobs.values()].filter(job => job.active);
      const photos = active.filter(job => job.route === "photos");
      const designs = active.filter(job => job.route !== "photos");
      setActivity({ count: designs.length, stage: designs[0]?.stage || "", photos: photos.length, photoStage: photos[0]?.stage || "" });
    };
    const receive = (event: Event) => {
      const job = (event as CustomEvent<Pick<DesignJob, "id" | "status" | "stage"> & { route?: string }>).detail;
      if (!job?.id) return;
      const route = job.route || "jobs", key = `${route}/${job.id}`;
      if (["queued", "running"].includes(job.status))
        jobs.set(key, { seen: Date.now(), active: true, stage: job.stage, route });
      else jobs.delete(key);
      update();
    };
    const poll = async () => {
      if (polling || stopped) return;
      const stale = [...jobs].filter(([, job]) => Date.now() - job.seen > 3000);
      if (!stale.length) return;
      polling = true;
      try {
        token ||= (await designerRequest("/session")).token;
        for (const [id] of stale) {
          if (stopped || !jobs.has(id)) continue;
          try { await designerRequest(`/${id}?summary=1`, token); }
          catch (error) {
            if (error instanceof DesignerRequestError && error.status === 404) {
              jobs.delete(id);
              update();
            } else if (error instanceof DesignerRequestError && error.status === 403) token = undefined;
          }
        }
      } catch { /* Retain known activity during a temporary disconnection. */ }
      finally { polling = false; }
    };
    window.addEventListener("forma:designer-activity", receive);
    const timer = window.setInterval(() => void poll(), 1500);
    void poll();
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("forma:designer-activity", receive);
    };
  }, []);
  return activity;
}
