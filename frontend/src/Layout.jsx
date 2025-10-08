import React from 'react';
// Deprecated legacy layout with header/footer. Use SiteLayout instead.

const Layout = ({ children }) => (
  <div className="min-h-screen flex flex-col bg-dark text-white font-roboto">
    <main className="flex-1 flex flex-col items-center justify-center relative z-10">
      {children}
    </main>
  </div>
);

export default Layout; 