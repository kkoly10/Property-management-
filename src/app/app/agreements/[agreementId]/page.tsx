import { AgreementDetail } from "@/components/agreements/agreement-pages";

export const dynamic = "force-dynamic";

export default async function OperatorAgreementPage({ params }: { params: Promise<{ agreementId: string }> }) {
  const { agreementId } = await params;
  return <AgreementDetail agreementId={agreementId} surface="operator" />;
}
