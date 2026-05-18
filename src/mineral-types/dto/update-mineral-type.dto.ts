import { PartialType } from '@nestjs/swagger';
import { CreateMineralTypeDto } from './create-mineral-type.dto';

export class UpdateMineralTypeDto extends PartialType(CreateMineralTypeDto) {}
