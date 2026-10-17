import { createContext, useContext } from "react";
import type { DesignStyleProfile } from "../shared/design-style.mjs";
import type { BrandProfile } from "../shared/brand-context.mjs";
export const DesignStyleContext = createContext<{
  profile?: DesignStyleProfile;
  ready: boolean;
  open: () => void;
  save: (profile: DesignStyleProfile, brand?: BrandProfile) => Promise<void>;
}>({ ready: false, open: () => {}, save: async () => {} });
export const useDesignStyle = () => useContext(DesignStyleContext);
