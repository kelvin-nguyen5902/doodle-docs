import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import { DocumentsProvider } from "../context/DocumentsContext";
import { InvitationsProvider } from "../context/InvitationsContext";

export default function AppLayout() {
  return (
    <DocumentsProvider>
      <InvitationsProvider>
        <div className="app-shell" style={{ display: "flex" }}>
          <Sidebar />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <Outlet />
          </div>
        </div>
      </InvitationsProvider>
    </DocumentsProvider>
  );
}
