-- Le responsable hiérarchique n'est plus utilisé par le métier.
-- La colonne est conservée pour rendre le déploiement réversible, mais ses valeurs sont effacées.
UPDATE "ei_mgp"."users"
SET "responsable_hierarchique_id" = NULL,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "responsable_hierarchique_id" IS NOT NULL;

DELETE FROM "ei_mgp"."notification_templates"
WHERE "evenement_code" = 'alerte_retard_n1';

UPDATE "ei_mgp"."notification_templates"
SET "corps" = E'Bonjour,\n\nUn dossier nécessite votre prise en charge.\n\nRéférence : {reference}\nType de déclaration : {parcours}\n\nAction attendue : consultez le dossier dans la plateforme EI / MGP et engagez son traitement dans les délais prévus.\n\nCordialement,\nL’équipe EI / MGP\n\nCeci est un message automatique. Merci de ne pas y répondre.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "evenement_code" = 'dossier_affecte' AND "canal" = 'email';

UPDATE "ei_mgp"."notification_templates"
SET "corps" = E'Bonjour,\n\nLe traitement de votre déclaration a évolué.\n\nRéférence : {reference}\nNouveau statut : {statut}\n\nVous pouvez consulter son avancement depuis la page de suivi, à l’aide des informations qui vous ont été remises lors de la déclaration.\n\nCordialement,\nL’équipe EI / MGP\n\nCeci est un message automatique. Merci de ne pas y répondre.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "evenement_code" = 'statut_change' AND "canal" = 'email';

UPDATE "ei_mgp"."notification_templates"
SET "corps" = E'Bonjour,\n\nL’échéance de traitement d’un dossier approche.\n\nRéférence : {reference}\nType de déclaration : {parcours}\nDélai restant : {jours_restants} jour(s)\n\nAction attendue : vérifiez l’avancement du dossier et réalisez les actions nécessaires avant l’échéance.\n\nCordialement,\nL’équipe EI / MGP\n\nCeci est un message automatique. Merci de ne pas y répondre.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "evenement_code" = 'relance_echeance' AND "canal" = 'email';

UPDATE "ei_mgp"."notification_templates"
SET "corps" = E'Bonjour,\n\nUn dossier a dépassé son délai de traitement.\n\nRéférence : {reference}\nType de déclaration : {parcours}\n\nAction attendue : examinez la situation, identifiez le point de blocage et coordonnez les mesures nécessaires à la reprise du traitement.\n\nCordialement,\nL’équipe EI / MGP\n\nCeci est un message automatique. Merci de ne pas y répondre.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "evenement_code" = 'alerte_retard_service_mgp' AND "canal" = 'email';

UPDATE "ei_mgp"."notification_templates"
SET "corps" = E'Bonjour,\n\nUn dossier présente un dépassement supérieur ou égal à 50 % du délai de traitement prévu.\n\nRéférence : {reference}\nType de déclaration : {parcours}\n\nAction attendue : prenez connaissance du dossier et assurez-vous qu’un plan de rattrapage est engagé et suivi.\n\nCordialement,\nL’équipe EI / MGP\n\nCeci est un message automatique. Merci de ne pas y répondre.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "evenement_code" = 'alerte_retard_direction' AND "canal" = 'email';

UPDATE "ei_mgp"."notification_templates"
SET "corps" = E'Bonjour,\n\nUne déclaration critique vient d’être enregistrée et nécessite une prise en charge immédiate.\n\nRéférence : {reference}\nType de déclaration : {parcours}\nNiveau : Critique\n\nActions attendues : sécuriser la situation, engager les premières mesures conservatoires dans les 24 heures et assurer l’information de la Direction Générale jusqu’à la clôture.\n\nCordialement,\nL’équipe EI / MGP\n\nCeci est un message automatique. Merci de ne pas y répondre.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "evenement_code" = 'circuit_critique' AND "canal" = 'email';
