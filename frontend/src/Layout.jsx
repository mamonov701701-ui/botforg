import React from 'react';
import Header from './components/Header';
import Footer from './components/Footer';

const Layout = ({ children }) => (
  <div className="min-h-screen flex flex-col bg-dark text-white font-roboto">
    <Header />
    <main className="flex-1 flex flex-col items-center justify-center relative z-10">
      {children}
    </main>
    <Footer />
  </div>
);

export default Layout; 