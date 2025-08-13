from pydantic import BaseModel

class TagCreate(BaseModel):
    name: str

class TagOut(BaseModel):
    id: int
    name: str

    class Config:
        orm_mode = True 