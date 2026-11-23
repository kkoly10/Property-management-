type Language = "en" | "es" | "fr";
type Copy = readonly [subject: string, detail: string];
type Destination = "tourOperator" | "applicationOperator" | "applicationRenter" | "agreementInvite"
  | "agreementOperator" | "agreementRenter" | "conversationRenter" | "inquiryOperator" | "tourRenter";

export const rentalLifecycleCopy = {
  message_rental_tour_received: {
    destination: "tourOperator",
    en: ["A renter requested a tour", "A prospective renter verified their email and proposed times. Open your Crecy dashboard to review and respond."],
    es: ["Solicitaron una visita", "La persona interesada verificó su correo y propuso horarios. Abre tu panel de Crecy para responder."],
    fr: ["Une visite a été demandée", "La personne a vérifié son courriel et proposé des heures. Ouvrez votre tableau de bord Crecy pour répondre."],
  },
  message_rental_application_received: {
    destination: "applicationOperator",
    en: ["A rental application is ready to review", "Open your Crecy dashboard to review this application and choose the next step."],
    es: ["Hay una solicitud de alquiler para revisar", "Abre tu panel de Crecy para revisar la solicitud y elegir el siguiente paso."],
    fr: ["Une demande de location est prête à examiner", "Ouvrez votre tableau de bord Crecy pour examiner la demande et choisir la suite."],
  },
  message_rental_application_updated: {
    destination: "applicationOperator",
    en: ["A renter updated their application", "Open your Crecy dashboard to review the new submission."],
    es: ["Una persona actualizó su solicitud", "Abre tu panel de Crecy para revisar la actualización."],
    fr: ["Une personne a mis à jour sa demande", "Ouvrez votre tableau de bord Crecy pour examiner la mise à jour."],
  },
  message_rental_application_withdrawn: {
    destination: "applicationOperator",
    en: ["A rental application was withdrawn", "The renter withdrew their application. Open your Crecy dashboard to see the current status."],
    es: ["Retiraron una solicitud de alquiler", "La persona retiró su solicitud. Consulta el estado en tu panel de Crecy."],
    fr: ["Une demande de location a été retirée", "La personne a retiré sa demande. Consultez son état dans votre tableau de bord Crecy."],
  },
  rental_application_received: {
    destination: "applicationRenter",
    en: ["Your rental application was submitted", "The landlord can now review your application. You can check its status or return when the landlord requests an update."],
    es: ["Enviaste tu solicitud de alquiler", "El propietario ya puede revisar tu solicitud. Puedes volver para consultar su estado."],
    fr: ["Votre demande de location est transmise", "Le propriétaire peut maintenant examiner votre demande. Vous pouvez en consulter l’état."],
  },
  rental_application_changes_requested: {
    destination: "applicationRenter",
    en: ["Action requested on your rental application", "The landlord asked you to update your application. Open your private application to see what to provide."],
    es: ["Tu solicitud de alquiler requiere una acción", "El propietario solicitó una actualización. Abre tu solicitud para consultar qué debes enviar."],
    fr: ["Une action est demandée pour votre demande de location", "Le propriétaire demande une mise à jour. Ouvrez votre demande pour voir ce qu’il faut fournir."],
  },
  rental_application_lease_preparing: {
    destination: "applicationRenter",
    en: ["The landlord is preparing lease details", "The landlord started preparing lease details for this application. You’ll receive a separate invitation when there is a lease to sign."],
    es: ["El propietario está preparando el contrato", "Recibirás una invitación aparte cuando el contrato esté listo para firmar."],
    fr: ["Le propriétaire prépare le bail", "Vous recevrez une invitation distincte lorsque le bail sera prêt à signer."],
  },
  rental_application_closed: {
    destination: "applicationRenter",
    en: ["Your rental application was closed", "The landlord closed this application. Use the application reference below if you need to ask about the decision."],
    es: ["Cerraron tu solicitud de alquiler", "El propietario cerró tu solicitud. Usa la referencia si necesitas hacer una consulta."],
    fr: ["Votre demande de location est fermée", "Le propriétaire a fermé la demande. Utilisez la référence pour toute question."],
  },
  rental_application_withdrawn: {
    destination: "applicationRenter",
    en: ["Your rental application was withdrawn", "Your withdrawal is recorded. Keep the application reference below for your records."],
    es: ["Retiraste tu solicitud de alquiler", "Registramos el retiro. Guarda la referencia de tu solicitud."],
    fr: ["Votre demande de location a été retirée", "Votre retrait est enregistré. Conservez la référence de la demande."],
  },
  rental_agreement_signing_requested: {
    destination: "agreementInvite",
    en: ["Your lease is ready to review and sign", "Your landlord sent you a lease. Use the link below and sign in with the email you used for the application."],
    es: ["Tu contrato está listo para revisar y firmar", "Tu propietario te envió un contrato. Usa el enlace e inicia sesión con el correo de tu solicitud."],
    fr: ["Votre bail est prêt à examiner et à signer", "Votre propriétaire vous a transmis un bail. Ouvrez le lien et connectez-vous avec le courriel de votre demande."],
  },
  rental_agreement_signature_required: {
    destination: "agreementOperator",
    en: ["Your rental agreement is ready to countersign", "The renter has signed. Review the exact agreement in your Crecy dashboard and add your signature."],
    es: ["El contrato está listo para tu firma", "La persona ya firmó. Revisa el contrato y añade tu firma en el panel de Crecy."],
    fr: ["Votre bail est prêt à contresigner", "La personne a signé. Examinez le bail dans votre tableau de bord Crecy et ajoutez votre signature."],
  },
  rental_agreement_renter_signed: {
    destination: "agreementRenter",
    en: ["We recorded your lease signature", "Your signature is recorded. The agreement page shows any signatures still needed."],
    es: ["Registramos tu firma", "Consulta el contrato para ver si falta alguna firma."],
    fr: ["Votre signature du bail est enregistrée", "La page du bail indique les signatures qui restent à obtenir."],
  },
  rental_agreement_renter_executed: {
    destination: "agreementRenter",
    en: ["Your lease is fully signed", "All required parties signed. Sign in to retrieve the signed lease and its signature record."],
    es: ["Tu contrato ya está firmado", "Todas las partes firmaron. Inicia sesión para descargar el contrato y el registro de firmas."],
    fr: ["Votre bail est entièrement signé", "Toutes les parties ont signé. Connectez-vous pour obtenir le bail signé et le relevé des signatures."],
  },
  rental_agreement_operator_executed: {
    destination: "agreementOperator",
    en: ["Your rental agreement is fully signed", "All required parties signed. Open your Crecy dashboard to retrieve the signed lease and signature record."],
    es: ["El contrato de alquiler ya está firmado", "Todas las partes firmaron. Abre el panel de Crecy para descargar el contrato y el registro de firmas."],
    fr: ["Votre bail est entièrement signé", "Toutes les parties ont signé. Ouvrez le tableau de bord Crecy pour obtenir le bail et le relevé des signatures."],
  },
  rental_agreement_renter_closed: {
    destination: "agreementRenter",
    en: ["Your lease signing request ended", "This lease request is no longer open for signatures. Open the agreement to see its current status."],
    es: ["Terminó la solicitud de firma", "La solicitud de firma se cerró. Abre el contrato para consultar su estado."],
    fr: ["La demande de signature a pris fin", "La signature est fermée. Ouvrez le bail pour voir son état."],
  },
  rental_agreement_operator_closed: {
    destination: "agreementOperator",
    en: ["A lease signing request ended", "This agreement is no longer open for signatures. Open your dashboard to review the current status."],
    es: ["Terminó una solicitud de firma", "Abre el panel de Crecy para revisar el estado del contrato."],
    fr: ["Une demande de signature a pris fin", "Ouvrez le tableau de bord Crecy pour consulter l’état du bail."],
  },
  rental_tour_cancelled: {
    destination: "tourRenter",
    en: ["Your rental tour was canceled", "The tour is canceled. Open the rental listing to request a new tour if it is still available."],
    es: ["Cancelaron tu visita", "Si el alquiler sigue disponible, puedes solicitar otra visita desde el anuncio."],
    fr: ["Votre visite a été annulée", "Vous pouvez demander une autre visite depuis l’annonce si le logement est toujours disponible."],
  },
  rental_tour_rescheduled: {
    destination: "tourRenter",
    en: ["Your rental tour was rescheduled", "The landlord changed your tour. Use the new time and location below."],
    es: ["Cambió el horario de tu visita", "El propietario cambió tu visita. Consulta la nueva hora y el punto de encuentro."],
    fr: ["L’heure de votre visite a changé", "Le propriétaire a déplacé la visite. Consultez la nouvelle heure et le lieu ci-dessous."],
  },
  rental_inquiry_reply: {
    destination: "conversationRenter",
    en: ["The landlord replied to your question", "Open the private conversation to read the reply and respond."],
    es: ["El propietario respondió tu pregunta", "Abre la conversación privada para leer la respuesta y contestar."],
    fr: ["Le propriétaire a répondu à votre question", "Ouvrez la conversation privée pour lire la réponse et y répondre."],
  },
  rental_tour_reply: {
    destination: "conversationRenter",
    en: ["The landlord replied about your tour", "Open the private tour conversation to read the reply and respond."],
    es: ["El propietario respondió sobre tu visita", "Abre la conversación privada para leer la respuesta y contestar."],
    fr: ["Le propriétaire a répondu au sujet de la visite", "Ouvrez la conversation privée pour lire la réponse et y répondre."],
  },
  rental_conversation_access: {
    destination: "conversationRenter",
    en: ["Open your private rental conversation", "Use your one-time link to return to the conversation."],
    es: ["Abre tu conversación privada sobre el alquiler", "Usa el enlace de un solo uso para volver a la conversación."],
    fr: ["Ouvrez votre conversation privée sur la location", "Utilisez le lien à usage unique pour reprendre votre conversation."],
  },
  message_rental_inquiry_reply: {
    destination: "inquiryOperator",
    en: ["A renter replied to a rental inquiry", "Open your Crecy dashboard to read the reply and respond."],
    es: ["Una persona respondió a una consulta", "Abre tu panel de Crecy para leer la respuesta y contestar."],
    fr: ["Une personne a répondu à une question de location", "Ouvrez le tableau de bord Crecy pour lire la réponse et y répondre."],
  },
  message_rental_tour_reply: {
    destination: "tourOperator",
    en: ["A renter replied about a tour", "Open your Crecy dashboard to read the reply and respond."],
    es: ["Una persona respondió sobre una visita", "Lee la respuesta y contesta desde tu panel de Crecy."],
    fr: ["Une personne a répondu au sujet d’une visite", "Lire la réponse dans votre tableau de bord Crecy."],
  },
} satisfies Record<string, { destination: Destination } & Record<Language, Copy>>;

export type RentalLifecycleTemplate = keyof typeof rentalLifecycleCopy;

export function isRentalLifecycleTemplate(code: string): code is RentalLifecycleTemplate {
  return Object.hasOwn(rentalLifecycleCopy, code);
}
