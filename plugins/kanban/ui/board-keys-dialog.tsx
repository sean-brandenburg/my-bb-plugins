import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KEY_HELP } from "./board-nav";

export function BoardKeysDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Work anywhere on the board or an open card outside a text box.</DialogDescription>
        </DialogHeader>
        {KEY_HELP.map((section) => (
          <section key={section.title} className="flex flex-col gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{section.title}</h3>
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
              {section.keys.map(({ keys, action }) => (
                <div key={action} className="contents">
                  <dt className="flex gap-1">
                    {keys.map((key) => (
                      <kbd key={key} className="min-w-6 rounded border border-border bg-muted px-1.5 py-0.5 text-center font-mono text-xs">
                        {key}
                      </kbd>
                    ))}
                  </dt>
                  <dd className="text-muted-foreground">{action}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </DialogContent>
    </Dialog>
  );
}
