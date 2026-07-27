import Stock from "./Stock"

export const metadata = {
  title: '股市',
}

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  return (
    <div className='w-full p-4 md:p-8 flex flex-col gap-4 md:gap-6 '>
      <Stock code={code} />
    </div>
  )
}
