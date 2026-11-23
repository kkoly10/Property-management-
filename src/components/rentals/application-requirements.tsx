import { applicationEvidenceLabels, type ApplicationRequirementsInput } from "@/lib/validation/rental-listing";

export function ApplicationRequirements({ requirements }: { requirements: ApplicationRequirementsInput }) {
  return (
    <div className="space-y-4 text-sm leading-6">
      {requirements.criteriaText ? (
        <div>
          <p className="font-semibold">Landlord’s criteria</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{requirements.criteriaText}</p>
        </div>
      ) : null}
      {requirements.requiredDocumentTypes.length > 0 ? (
        <div>
          <p className="font-semibold">What to provide</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
            {requirements.requiredDocumentTypes.map((type) => <li key={type}>{applicationEvidenceLabels[type]}</li>)}
          </ul>
        </div>
      ) : null}
      {requirements.acceptedAlternatives ? (
        <div>
          <p className="font-semibold">Accepted alternatives</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{requirements.acceptedAlternatives}</p>
        </div>
      ) : null}
    </div>
  );
}
