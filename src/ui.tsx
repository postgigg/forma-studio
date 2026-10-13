import { useEffect, useRef, type ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";
import type { Template } from "./templates";

export function IconButton({
  icon: Icon,
  label,
  onClick,
  active = false,
  disabled = false,
  className = "",
  expanded,
  controls,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  expanded?: boolean;
  controls?: string;
}) {
  return (
    <button
      className={`icon-button ${active ? "active" : ""} ${className}`}
      title={label}
      aria-label={label}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={18} strokeWidth={1.7} />
    </button>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <IconButton icon={X} label="Close dialog" onClick={onClose} />
      </div>
      {children}
    </dialog>
  );
}
export function TemplatePreview({ template: t }: { template: Template }) {
  if(t.thumbnail)return <div className="template-art custom-template" style={{background:t.background}}><img loading="lazy" src={t.thumbnail} alt="" draggable={false}/></div>;
  return (
    <div
      className={`template-art layout-${t.layout}`}
      style={{ background: t.background, color: t.ink, fontFamily: t.font }}
    >
      {t.photo && <img src={t.photo} alt="" draggable={false} />}
      <span className="preview-eyebrow">{t.subtitle}</span>
      {t.layout === "botanical" && (
        <>
          <i className="preview-arch" style={{ background: t.accent }} />
          <i className="preview-vase" />
          <i className="preview-stem" />
          <i className="preview-leaf leaf-one" style={{ background: t.ink }} />
          <i className="preview-leaf leaf-two" />
          <i
            className="preview-leaf leaf-three"
            style={{ background: t.ink }}
          />
        </>
      )}
      {t.layout === "bold" && (
        <i className="preview-circle" style={{ background: t.accent }} />
      )}
      <strong className="preview-headline">{t.headline}</strong>
      <span className="preview-footer">STUDIO / 01</span>
    </div>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
