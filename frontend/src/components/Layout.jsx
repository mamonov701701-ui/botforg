import { Outlet } from "react-router-dom"
import Header from "@/components/Header"
import Footer from "@/components/Footer"
import useAuthModal from "@/hooks/useAuthModal"
import AuthModal from "@/components/AuthModal"

export default function Layout() {
  const authModal = useAuthModal();
  return (
    <div className="min-h-screen bg-[#0b132b] text-white overflow-x-hidden">
      <img
        src="/bg/background.png"
        alt="background"
        className="absolute top-0 left-0 w-full h-full object-cover z-0"
      />
      <div className="relative z-10 min-h-screen flex flex-col">
        <Header openAuthModal={authModal.openModal} />
        <AuthModal open={authModal.open} onClose={authModal.closeModal} />
        <main className="flex-1 flex flex-col">
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  )
} 