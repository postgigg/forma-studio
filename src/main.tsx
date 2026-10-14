import { createRoot } from "react-dom/client";
import App from "./App";
import { BrandProvider } from "./BrandContext";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <BrandProvider>
    <App />
  </BrandProvider>,
);
