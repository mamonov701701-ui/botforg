from pydantic import BaseModel, ConfigDict


class TagCreate(BaseModel):
    name: str


class TagOut(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)
