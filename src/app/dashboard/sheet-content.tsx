import FicheView from "@/components/FicheView";
import type { StoredSheet } from "@/lib/fiche";

type Props = {
  sheet: StoredSheet;
  matiere?: string;
  dureeSecondes?: number;
  nbMotsTranscrits?: number;
  creeLe?: string;
};

// Sheets generated before the JSON migration are markdown strings and keep
// the rendering they always had; fiche objects go through FicheView. One
// switch, used by every page that shows a sheet, so no page can end up
// handing an object to a text renderer.
export default function SheetContent({ sheet, ...meta }: Props) {
  if (typeof sheet === "string") {
    return (
      <article className="whitespace-pre-wrap rounded-2xl border border-line-soft bg-white p-5 text-sm leading-relaxed text-ink">
        {sheet}
      </article>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-line-soft bg-white">
      <FicheView fiche={sheet} {...meta} />
    </div>
  );
}
