const Meeting = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params

  return (
    <div>Meeting Room: #{id}</div>
  )
}

export default Meeting