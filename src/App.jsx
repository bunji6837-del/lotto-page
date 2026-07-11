import { useEffect, useState } from "react";
import LottoBoard from "./LottoBoard";
import AdminPrivatePage from "./AdminPrivatePage";

function readRoute() {
  const route = window.location.hash.replace(/^#/, "");
  return route === "/admin" ? "/admin" : "/";
}

export default function App() {
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    const handleHashChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return route === "/admin" ? <AdminPrivatePage /> : <LottoBoard />;
}
