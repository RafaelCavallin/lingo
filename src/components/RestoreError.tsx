export function RestoreError({ message }: { message: string }) {
  return (
    <p role="alert" className="mb-6 text-sm text-miss">
      {message}
    </p>
  )
}
