import Footer from '@/components/website/Footer'
import Navbar from '@/components/website/Navbar'
import React from 'react'

interface Props {
  children: React.ReactNode
}

export default function Wrapper({ children }: Props) {
  return (
    <div className="mk-site min-h-screen w-full overflow-x-clip bg-white">
      <Navbar />
      <div aria-hidden="true" className="w-full pt-16 md:pt-20"></div>
      {children}
      <Footer />
    </div>
  )
}
