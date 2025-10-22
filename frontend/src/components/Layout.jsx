import { Outlet } from "react-router-dom"
// Deprecated local layout: header/footer now provided by SiteLayout
// Keep minimal wrapper to avoid accidental usage

export default function Layout() { return <Outlet /> }