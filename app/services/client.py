"""고객사 저장과 목록 조회를 처리합니다."""

from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.client import Client
from app.schemas.client import ClientCreate, ClientRead


# 고객사를 DB에 저장하고 응답 스키마로 변환합니다.
# 트랜잭션 블록이 정상 종료되면 커밋하고, 예외가 발생하면 롤백합니다.
async def create_client(session: AsyncSession, data: ClientCreate) -> ClientRead:

    async with session.begin(): # 이 블록을 하나의 트랜잭션으로 묶음
        client = (
            await session.scalars( # 각 행의 첫 번째 값만 꺼내줌
                insert(Client).values(**data.model_dump()).returning(Client)
            )
        ).one() # 결과가 정확히 한 행일 때만 객체를 꺼낸다.
        result = ClientRead.model_validate(client)

    return result


# 고객사를 생성 시각·ID 오름차순으로 조회해 응답 스키마의 튜플로 반환합니다.
# offset개를 건너뛴 뒤 최대 limit개를 가져오며, DB 응답을 기다리는 동안 다른 요청을 처리할 수 있습니다.
async def list_clients(
    session: AsyncSession, *, limit: int, offset: int # offset - 건너뛸 행
) -> tuple[ClientRead, ...]:
    clients = await session.scalars(
        select(Client)
        .order_by(Client.created_at, Client.id)
        .limit(limit)
        .offset(offset)
    )

    return tuple(ClientRead.model_validate(client) for client in clients)
