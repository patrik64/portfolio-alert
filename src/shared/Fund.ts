import { Entity, Fields } from 'remult';

@Entity<Fund>('funds', {
	allowApiRead: true, // mutations only happen in backend code (ScrapeController)
	id: { slug: true },
	defaultOrderBy: { name: 'asc' }
})
export class Fund {
	@Fields.string()
	slug = '';

	@Fields.string()
	name = '';

	@Fields.integer()
	companyCount = 0;

	// newcomers found by the last successful fetch
	@Fields.integer()
	newCount = 0;

	@Fields.date({ allowNull: true })
	lastFetchedAt?: Date;

	// '' = last fetch succeeded
	@Fields.string()
	lastError = '';
}
