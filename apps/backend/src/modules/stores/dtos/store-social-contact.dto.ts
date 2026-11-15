import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { IsStoreSocialContact } from '../validation/store-social-contact';

export class StoreSocialContactDto {
  @ApiPropertyOptional({
    type: 'string',
    nullable: true,
    maxLength: 500,
    description:
      'Perfil HTTPS de instagram.com o www.instagram.com; sin parámetros, fragmentos ni publicaciones. Null elimina el enlace.',
    example: 'https://www.instagram.com/negocio_local/',
  })
  @IsOptional()
  @IsStoreSocialContact('instagramUrl')
  instagramUrl?: string | null;

  @ApiPropertyOptional({
    type: 'string',
    nullable: true,
    maxLength: 500,
    description:
      'Perfil HTTPS de facebook.com o www.facebook.com por nombre o profile.php?id=numérico; sin parámetros adicionales. Null elimina el enlace.',
    example: 'https://www.facebook.com/NegocioLocal/',
  })
  @IsOptional()
  @IsStoreSocialContact('facebookUrl')
  facebookUrl?: string | null;

  @ApiPropertyOptional({
    type: 'string',
    nullable: true,
    maxLength: 64,
    description:
      'Número internacional explícito: 8–15 dígitos con código de país, o + con espacios/guiones. Se guarda solo dígitos. Independiente de telefono; null lo elimina.',
    example: '+506 8888-8888',
  })
  @IsOptional()
  @IsStoreSocialContact('whatsappComercial')
  whatsappComercial?: string | null;
}
