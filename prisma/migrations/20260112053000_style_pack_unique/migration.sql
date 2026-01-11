-- Ensure one active style pack per project

CREATE UNIQUE INDEX "Project_stylePackId_key" ON "Project"("stylePackId");
