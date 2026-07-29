-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_route_permissions" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "level" TEXT NOT NULL,

    CONSTRAINT "role_route_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "role_route_permissions_role_id_route_key" ON "role_route_permissions"("role_id", "route");

-- AddForeignKey
ALTER TABLE "role_route_permissions" ADD CONSTRAINT "role_route_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
