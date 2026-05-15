import { redirect } from 'next/navigation'

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const SOURCE_SHOP = 'https://storeaaaaaaaai.myshopify.com'

  // Rediriger vers la page de confirmation de la boutique A
  redirect(`${SOURCE_SHOP}/pages/order-confirmed?token=${token ?? ''}`)
}
