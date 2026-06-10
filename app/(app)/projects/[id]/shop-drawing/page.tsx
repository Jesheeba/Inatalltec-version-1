import { ShopDrawingPage } from "@/components/modules/design/ShopDrawing";

export default function Page({ params }: { params: { id: string } }) {
  return <ShopDrawingPage projectId={params.id} />;
}
